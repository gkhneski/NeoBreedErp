"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { findSalesDepot } from "@/lib/sales-depot";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STOCK_WRITE_ROLES, companyModulePath } from "@/types/roles";

export type PromoResult = { ok: true } | { ok: false; error: string };

const uuid = z.string().uuid();

const createItemSchema = z.object({
  company_id: uuid,
  name: z.string().trim().min(2, "Ad en az 2 karakter olmalı.").max(120),
  barcode: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z0-9._\-/]*$/, "Barkod geçersiz karakter içeriyor."),
});

function revalidatePromo(companyId: string) {
  revalidatePath(companyModulePath(companyId, "promo"));
  revalidatePath(companyModulePath(companyId, "stock"));
  revalidatePath(companyModulePath(companyId, "warehouse"));
  revalidatePath(companyModulePath(companyId));
}

// Promosyon ürünü = satılmayan, depoda sayılan ürün (materials.type = 'promo').
// Depocu kendi tanımlar; reçete/fiyat/katalog kapsamı yoktur.
export async function createPromoItem(
  companyIdInput: string,
  nameInput: string,
  barcodeInput: string,
): Promise<PromoResult> {
  const parsed = createItemSchema.safeParse({
    company_id: companyIdInput,
    name: nameInput,
    barcode: barcodeInput,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Geçersiz veri." };
  }
  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    STOCK_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("materials")
    .select("code")
    .eq("company_id", companyId)
    .like("code", "PRM-%");
  const maxNum = (existing ?? []).reduce((max, row) => {
    const m = row.code.match(/^PRM-(\d+)$/i);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  const code = `PRM-${String(maxNum + 1).padStart(2, "0")}`;

  const { error } = await supabase.from("materials").insert({
    company_id: companyId,
    code,
    name: parsed.data.name,
    type: "promo",
    base_uom: "unit",
    barcode: parsed.data.barcode || null,
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Bu barkod veya kod zaten kayıtlı." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePromo(companyId);
  return { ok: true };
}

const addStockSchema = z.object({
  company_id: uuid,
  material_id: uuid,
  quantity: z.number().positive("Adet 0'dan büyük olmalı.").max(10_000_000),
  note: z.string().trim().max(300),
  location_id: uuid.nullable(),
});

function promoLotNumber(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `PRM-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

// Eldeki promosyon adedi satış deposuna serbest lot olarak girilir.
export async function addPromoStock(
  companyIdInput: string,
  materialIdInput: string,
  quantityInput: number,
  noteInput: string,
  locationIdInput: string | null = null,
): Promise<PromoResult> {
  const parsed = addStockSchema.safeParse({
    company_id: companyIdInput,
    material_id: materialIdInput,
    quantity: quantityInput,
    note: noteInput,
    location_id: locationIdInput || null,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Geçersiz veri." };
  }
  const { companyId } = await requireCompanyRole(
    parsed.data.company_id,
    STOCK_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: material } = await supabase
    .from("materials")
    .select("id")
    .eq("id", parsed.data.material_id)
    .eq("company_id", companyId)
    .eq("type", "promo")
    .is("deleted_at", null)
    .maybeSingle();
  if (!material) return { ok: false, error: "Promosyon ürünü bulunamadı." };

  const depot = await findSalesDepot(supabase, companyId);
  if (!depot) {
    return {
      ok: false,
      error: "Satış deposu tanımlı değil. Depo Hareketleri → Konumlar'dan ekleyin.",
    };
  }

  // Hedef: satış deposu ya da onun bir rafı. Başka depoya promosyon girilmez.
  let targetLocationId = depot.id;
  if (parsed.data.location_id && parsed.data.location_id !== depot.id) {
    const { data: shelf } = await supabase
      .from("locations")
      .select("id")
      .eq("id", parsed.data.location_id)
      .eq("company_id", companyId)
      .eq("kind", "shelf")
      .eq("parent_id", depot.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!shelf) return { ok: false, error: "Seçilen raf satış deposuna ait değil." };
    targetLocationId = shelf.id;
  }

  const { error } = await supabase.rpc("create_lot_with_receipt", {
    p_company_id: companyId,
    p_material_id: parsed.data.material_id,
    p_supplier_id: null,
    p_lot_number: promoLotNumber(new Date()),
    p_received_at: null,
    p_expiry_date: null,
    p_unit_cost: null,
    p_currency: null,
    p_quantity: parsed.data.quantity,
    p_notes: parsed.data.note || null,
    p_movement_notes: "promo stock entry",
    p_owner_customer_id: null,
    p_status: "released",
    p_location_id: targetLocationId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePromo(companyId);
  return { ok: true };
}

const correctSchema = z.object({
  company_id: uuid,
  lot_id: uuid,
  quantity: z.number().min(0, "Adet negatif olamaz.").max(10_000_000),
  note: z.string().trim().min(1, "Düzeltmenin nedenini yazın.").max(300),
});

// Elle düzeltme: fark, nedeniyle birlikte düzeltme hareketi olarak deftere yazılır.
export async function correctPromoLot(
  companyIdInput: string,
  lotIdInput: string,
  quantityInput: number,
  noteInput: string,
): Promise<PromoResult> {
  const parsed = correctSchema.safeParse({
    company_id: companyIdInput,
    lot_id: lotIdInput,
    quantity: quantityInput,
    note: noteInput,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Geçersiz veri." };
  }
  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    STOCK_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: lot } = await supabase
    .from("material_lots")
    .select("id, material_id, quantity_on_hand, materials:material_id!inner(type)")
    .eq("id", parsed.data.lot_id)
    .eq("company_id", companyId)
    .eq("materials.type", "promo")
    .is("deleted_at", null)
    .maybeSingle<{ id: string; material_id: string; quantity_on_hand: number }>();
  if (!lot) return { ok: false, error: "Lot bulunamadı." };

  const delta = parsed.data.quantity - Number(lot.quantity_on_hand);
  if (Math.abs(delta) < 1e-9) return { ok: true };

  const { error } = await supabase.from("stock_movements").insert({
    company_id: companyId,
    material_id: lot.material_id,
    lot_id: lot.id,
    kind: "adjustment",
    quantity: delta,
    reason: `Promosyon sayım düzeltmesi (önceki ${Number(lot.quantity_on_hand)}, yeni ${parsed.data.quantity})`,
    notes: parsed.data.note,
    occurred_at: new Date().toISOString(),
    created_by: ctx.userId,
  });
  if (error) {
    if (error.code === "23514" && /below zero/i.test(error.message)) {
      return { ok: false, error: "Adet negatife düşemez." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePromo(companyId);
  return { ok: true };
}
