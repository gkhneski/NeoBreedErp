"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireBuyer } from "@/lib/auth";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { portalHomePath } from "@/types/roles";

const itemSchema = z.object({
  material_id: z.string().uuid(),
  quantity: z.number().int().positive().max(1_000_000),
});

const orderSchema = z.object({
  items: z.array(itemSchema).min(1, "Sepet boş.").max(100),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type PlaceOrderResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

async function nextSalesOrderCode(
  service: ReturnType<typeof createServiceRoleClient>,
  companyId: string,
): Promise<string> {
  const { data } = await service
    .from("sales_orders")
    .select("code")
    .eq("company_id", companyId)
    .like("code", "SIP-%");
  const max = (data ?? []).reduce((cur, row) => {
    const m = row.code.match(/^SIP-(\d+)$/i);
    return m ? Math.max(cur, Number(m[1])) : cur;
  }, 0);
  return `SIP-${String(max + 1).padStart(6, "0")}`;
}

// Eczane alicisi portaldan siparis verir. Alici kimligi requireBuyer ile dogrulanir;
// kalemler buyer_catalog'a karsi denetlenir (yalnizca listelenen, tukenmemis urunler);
// fiyat anlik snapshot alinir.
export async function placeOrder(
  companyIdInput: string,
  itemsInput: Array<{ material_id: string; quantity: number }>,
  notesInput: string,
): Promise<PlaceOrderResult> {
  const parsed = orderSchema.safeParse({ items: itemsInput, notes: notesInput });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Geçersiz sipariş." };
  }

  const { ctx, companyId, customerId } = await requireBuyer(companyIdInput);

  // Catalog gate: buyer_catalog is RLS-scoped to this buyer's company and only
  // exposes listed products, so this both validates and prices the items.
  const supabase = await createServerSupabaseClient();
  const { data: catalog } = await supabase
    .from("buyer_catalog")
    .select("material_id, sale_price, availability")
    .eq("company_id", companyId);

  const byId = new Map(
    (catalog ?? []).map((c) => [
      c.material_id,
      { price: c.sale_price, availability: c.availability },
    ]),
  );

  for (const item of parsed.data.items) {
    const c = byId.get(item.material_id);
    if (!c) {
      return { ok: false, error: "Sepetteki bir ürün artık katalogda yok." };
    }
    if (c.availability === "out") {
      return { ok: false, error: "Sepetteki bir ürün tükendi; çıkarıp tekrar deneyin." };
    }
  }

  const service = createServiceRoleClient();
  const code = await nextSalesOrderCode(service, companyId);

  const { data: order, error: orderError } = await service
    .from("sales_orders")
    .insert({
      company_id: companyId,
      customer_id: customerId,
      code,
      status: "placed",
      source: "portal",
      placed_by: ctx.userId,
      notes: parsed.data.notes || null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return { ok: false, error: orderError?.message ?? "Sipariş oluşturulamadı." };
  }

  const { error: itemsError } = await service.from("sales_order_items").insert(
    parsed.data.items.map((item) => ({
      company_id: companyId,
      order_id: order.id,
      material_id: item.material_id,
      quantity: item.quantity,
      unit_price: byId.get(item.material_id)?.price ?? null,
      created_by: ctx.userId,
    })),
  );

  if (itemsError) {
    // Roll back the header so we never leave an empty order.
    await service.from("sales_orders").delete().eq("id", order.id);
    return { ok: false, error: itemsError.message };
  }

  revalidatePath(`${portalHomePath(companyId)}/orders`);
  return { ok: true, code };
}
