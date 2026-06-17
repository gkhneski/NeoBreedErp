"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STOCK_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { correctLotQuantity } from "../actions";

export type BoxesResult = { ok: true; note?: string } | { ok: false; error: string };

// Paket boyularını kaydet (ad'dan otomatik dolan değerleri owner düzeltebilir).
export async function applyPackSizes(
  companyIdInput: string,
  entries: Array<{ materialId: string; pack: number }>,
): Promise<BoxesResult> {
  const parsed = z
    .object({
      company: z.string().uuid(),
      entries: z
        .array(
          z.object({
            materialId: z.string().uuid(),
            pack: z.number().int().min(1).max(100000),
          }),
        )
        .max(2000),
    })
    .safeParse({ company: companyIdInput, entries });
  if (!parsed.success) return { ok: false, error: "Geçersiz veri." };

  const { companyId } = await requireCompanyRole(parsed.data.company, STOCK_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  for (const e of parsed.data.entries) {
    const { error } = await supabase
      .from("materials")
      .update({ units_per_pack: e.pack })
      .eq("id", e.materialId)
      .eq("company_id", companyId)
      .eq("type", "finished");
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(companyModulePath(companyId, "stock", "boxes"));
  return { ok: true, note: `${parsed.data.entries.length} ürün paket boyu kaydedildi.` };
}

// Seçilen bitmiş lotları tablet→kutu çevir: on-hand = qty / paket (düzeltme hareketi).
export async function convertLotsToBoxes(
  companyIdInput: string,
  lotIds: string[],
): Promise<BoxesResult> {
  const parsed = z
    .object({
      company: z.string().uuid(),
      lots: z.array(z.string().uuid()).min(1).max(1000),
    })
    .safeParse({ company: companyIdInput, lots: lotIds });
  if (!parsed.success) return { ok: false, error: "Geçersiz seçim." };

  const { companyId } = await requireCompanyRole(parsed.data.company, STOCK_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  const { data: lots } = await supabase
    .from("material_lots")
    .select("id, quantity_on_hand, materials:material_id(units_per_pack)")
    .eq("company_id", companyId)
    .in("id", parsed.data.lots)
    .is("deleted_at", null)
    .returns<
      Array<{
        id: string;
        quantity_on_hand: number;
        materials: { units_per_pack: number } | null;
      }>
    >();

  let converted = 0;
  for (const lot of lots ?? []) {
    const pack = lot.materials?.units_per_pack ?? 1;
    if (pack <= 1) continue;
    const boxes = Number(lot.quantity_on_hand) / pack;
    const res = await correctLotQuantity(companyId, lot.id, boxes);
    if (!res.ok) return { ok: false, error: res.error };
    converted++;
  }

  revalidatePath(companyModulePath(companyId, "stock", "boxes"));
  revalidatePath(companyModulePath(companyId, "stock"));
  return { ok: true, note: `${converted} lot kutuya çevrildi.` };
}
