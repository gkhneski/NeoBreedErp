"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STOCK_WRITE_ROLES, companyModulePath } from "@/types/roles";

export type ValuationResult =
  | { ok: true; updatedLots: number; updatedMaterials: number }
  | { ok: false; error: string };

// Maliyetsiz (unit_cost null) lotlara malzeme bazında birim maliyet yazar.
// Yalnızca hâlâ null olan, müşteri malı olmayan lotlar etkilenir; ledger
// append-only olduğu için geçmiş hareketlere dokunulmaz.
export async function applyOpeningCosts(
  companyIdInput: string,
  entries: Array<{ materialId: string; unitCost: number; currency: string }>,
): Promise<ValuationResult> {
  const parsed = z
    .object({
      company: z.string().uuid(),
      entries: z
        .array(
          z.object({
            materialId: z.string().uuid(),
            unitCost: z.number().finite().min(0),
            currency: z.enum(SUPPORTED_CURRENCIES),
          }),
        )
        .min(1)
        .max(2000),
    })
    .safeParse({ company: companyIdInput, entries });
  if (!parsed.success) return { ok: false, error: "Geçersiz veri." };

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company,
    STOCK_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  let updatedLots = 0;
  let updatedMaterials = 0;
  for (const e of parsed.data.entries) {
    const { data, error } = await supabase
      .from("material_lots")
      .update({
        unit_cost: e.unitCost,
        currency: e.currency,
        updated_by: ctx.userId,
      })
      .eq("company_id", companyId)
      .eq("material_id", e.materialId)
      .is("unit_cost", null)
      .is("owner_customer_id", null)
      .is("deleted_at", null)
      .select("id");
    if (error) return { ok: false, error: error.message };
    const n = data?.length ?? 0;
    if (n > 0) {
      updatedLots += n;
      updatedMaterials += 1;
    }
  }

  revalidatePath(companyModulePath(companyId, "stock", "valuation"));
  revalidatePath(companyModulePath(companyId, "stock"));
  revalidatePath(companyModulePath(companyId, "lots"));
  return { ok: true, updatedLots, updatedMaterials };
}
