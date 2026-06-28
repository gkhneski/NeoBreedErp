"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { gatherMrpPlan } from "@/lib/mrp/explode";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  MASTER_DATA_WRITE_ROLES,
  PRODUCTION_WRITE_ROLES,
  companyModulePath,
} from "@/types/roles";

export type MrpActionResult =
  | { ok: true; created: number; note: string }
  | { ok: false; error: string };

async function nextSeqCode(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  table: "production_orders" | "purchase_orders",
  companyId: string,
  prefix: string,
  pad: number,
): Promise<() => string> {
  const { data } = await supabase
    .from(table)
    .select("code")
    .eq("company_id", companyId)
    .like("code", `${prefix}-%`);
  let max = (data ?? []).reduce((cur, row) => {
    const m = row.code.match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
    return m ? Math.max(cur, Number(m[1])) : cur;
  }, 0);
  return () => `${prefix}-${String(++max).padStart(pad, "0")}`;
}

// MRP üretim ihtiyaçlarını taslak üretim emirlerine çevirir (YM önce, Mamül sonra).
export async function createProductionOrdersFromMrp(
  companyIdInput: string,
): Promise<MrpActionResult> {
  if (!z.string().uuid().safeParse(companyIdInput).success) {
    return { ok: false, error: "Geçersiz istek." };
  }
  const { ctx, companyId } = await requireCompanyRole(
    companyIdInput,
    PRODUCTION_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();
  const plan = await gatherMrpPlan(companyId);
  if (plan.production.length === 0) {
    return { ok: false, error: "Oluşturulacak üretim ihtiyacı yok." };
  }

  const nextCode = await nextSeqCode(
    supabase,
    "production_orders",
    companyId,
    "PO",
    6,
  );

  let created = 0;
  for (const p of plan.production) {
    const { error } = await supabase.from("production_orders").insert({
      company_id: companyId,
      code: nextCode(),
      finished_material_id: p.materialId,
      recipe_id: p.recipeId,
      planned_quantity: Math.ceil(p.produceQuantity),
      planned_uom: p.recipeYieldUom,
      status: "draft",
      notes: "MRP'den otomatik oluşturuldu",
      created_by: ctx.userId,
      updated_by: ctx.userId,
    });
    if (!error) created += 1;
  }

  revalidatePath(companyModulePath(companyId, "mrp"));
  revalidatePath(companyModulePath(companyId, "production"));
  revalidatePath(companyModulePath(companyId, "orders"));
  return {
    ok: true,
    created,
    note: `${created} üretim emri oluşturuldu (YM önce). Üretim modülünden planlayıp başlatın.`,
  };
}

// MRP satınalma ihtiyaçlarını tedarikçi bazında taslak satınalma siparişlerine çevirir.
export async function createPurchaseOrdersFromMrp(
  companyIdInput: string,
): Promise<MrpActionResult> {
  if (!z.string().uuid().safeParse(companyIdInput).success) {
    return { ok: false, error: "Geçersiz istek." };
  }
  const { ctx, companyId } = await requireCompanyRole(
    companyIdInput,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();
  const plan = await gatherMrpPlan(companyId);
  if (plan.purchases.length === 0) {
    return { ok: false, error: "Satın alınacak eksik malzeme yok." };
  }

  // Group by supplier (null supplier => its own PO).
  const groups = new Map<string, typeof plan.purchases>();
  for (const line of plan.purchases) {
    const key = line.supplierId ?? "__none__";
    const arr = groups.get(key) ?? [];
    arr.push(line);
    groups.set(key, arr);
  }

  const nextCode = await nextSeqCode(supabase, "purchase_orders", companyId, "SAT", 6);

  let created = 0;
  for (const [key, lines] of groups) {
    const supplierId = key === "__none__" ? null : key;
    const { data: po, error: poErr } = await supabase
      .from("purchase_orders")
      .insert({
        company_id: companyId,
        code: nextCode(),
        supplier_id: supplierId,
        status: "draft",
        notes: "MRP'den otomatik oluşturuldu",
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("id")
      .single();
    if (poErr || !po) continue;

    const { error: linesErr } = await supabase.from("purchase_order_lines").insert(
      lines.map((l) => ({
        company_id: companyId,
        purchase_order_id: po.id,
        material_id: l.materialId,
        quantity: Math.ceil(l.buyQuantity * 1000) / 1000,
        uom: l.uom,
        unit_cost: l.unitCost,
        created_by: ctx.userId,
      })),
    );
    if (!linesErr) created += 1;
  }

  revalidatePath(companyModulePath(companyId, "mrp"));
  revalidatePath(companyModulePath(companyId, "purchase-orders"));
  return {
    ok: true,
    created,
    note: `${created} satınalma siparişi oluşturuldu (tedarikçi bazında). Satınalma modülünden gönderin.`,
  };
}
