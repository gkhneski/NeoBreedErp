"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES, companyModulePath } from "@/types/roles";

const schema = z.object({
  company: z.string().uuid(),
  material: z.string().uuid(),
  is_listed: z.boolean(),
  sale_price: z.number().positive().max(10_000_000).nullable(),
  low_stock_threshold: z.number().int().min(0).max(10_000_000),
});

export type SaveCatalogResult = { ok: true } | { ok: false; error: string };

// Staff portala hangi bitmis urunun cikacagini, B2B fiyatini ve dusuk stok esigini
// belirler. (company_id, material_id) basina tek aktif satir; varsa guncelle, yoksa ekle.
export async function saveCatalogEntry(
  companyIdInput: string,
  materialIdInput: string,
  isListed: boolean,
  salePriceInput: number | null,
  thresholdInput: number,
): Promise<SaveCatalogResult> {
  const parsed = schema.safeParse({
    company: companyIdInput,
    material: materialIdInput,
    is_listed: isListed,
    sale_price: salePriceInput,
    low_stock_threshold: thresholdInput,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Geçersiz veri." };
  }
  if (parsed.data.is_listed && parsed.data.sale_price === null) {
    return { ok: false, error: "Listelemek için fiyat girin." };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("product_catalog")
    .select("id")
    .eq("company_id", companyId)
    .eq("material_id", parsed.data.material)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("product_catalog")
      .update({
        is_listed: parsed.data.is_listed,
        sale_price: parsed.data.sale_price,
        low_stock_threshold: parsed.data.low_stock_threshold,
        updated_by: ctx.userId,
      })
      .eq("id", existing.id)
      .eq("company_id", companyId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("product_catalog").insert({
      company_id: companyId,
      material_id: parsed.data.material,
      is_listed: parsed.data.is_listed,
      sale_price: parsed.data.sale_price,
      low_stock_threshold: parsed.data.low_stock_threshold,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(companyModulePath(companyId, "portal-catalog"));
  return { ok: true };
}
