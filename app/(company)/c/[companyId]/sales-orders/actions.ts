"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyRole, requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ORDER_WRITE_ROLES,
  SHIPMENT_WRITE_ROLES,
  companyModulePath,
} from "@/types/roles";

export type UnseenOrder = {
  id: string;
  code: string;
  customerName: string;
  summary: string;
  createdAt: string;
};
export type PollResult =
  | { ok: true; orders: UnseenOrder[] }
  | { ok: false };

type UnseenRow = {
  id: string;
  code: string;
  created_at: string;
  customers: { name: string } | null;
  sales_order_items: Array<{
    quantity: number;
    materials: { name: string } | null;
  }> | null;
};

// Her ERP ekraninda calisan bildirim icin: gorulmemis B2B siparisleri dondurur.
// Staff RLS firma kapsamli; herhangi bir firma uyesi cagirabilir.
export async function pollNewSalesOrders(
  companyIdInput: string,
): Promise<PollResult> {
  if (!z.string().uuid().safeParse(companyIdInput).success) return { ok: false };
  const { companyId } = await requireCompanyUser(companyIdInput);
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("sales_orders")
    .select(
      "id, code, created_at, customers:customer_id(name), " +
        "sales_order_items(quantity, materials:material_id(name))",
    )
    .eq("company_id", companyId)
    .is("seen_at", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<UnseenRow[]>();

  const orders: UnseenOrder[] = (data ?? []).map((o) => ({
    id: o.id,
    code: o.code,
    customerName: o.customers?.name ?? "—",
    summary: (o.sales_order_items ?? [])
      .map((it) => `${it.materials?.name ?? "Ürün"} ×${Number(it.quantity)}`)
      .join(", ")
      .slice(0, 140),
    createdAt: o.created_at,
  }));

  return { ok: true, orders };
}

export type OrderActionResult = { ok: true } | { ok: false; error: string };

// Depocu gelen B2B siparisi acinca gormus sayilir.
export async function markSalesOrderSeen(
  companyIdInput: string,
  orderIdInput: string,
): Promise<OrderActionResult> {
  const parsed = z
    .object({ company: z.string().uuid(), order: z.string().uuid() })
    .safeParse({ company: companyIdInput, order: orderIdInput });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const { companyId } = await requireCompanyRole(parsed.data.company, ORDER_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("sales_orders")
    .update({ seen_at: new Date().toISOString() })
    .eq("id", parsed.data.order)
    .eq("company_id", companyId)
    .is("seen_at", null);
  if (error) return { ok: false, error: error.message };

  revalidatePath(companyModulePath(companyId, "sales-orders"));
  revalidatePath(companyModulePath(companyId));
  return { ok: true };
}

export async function markAllSalesOrdersSeen(
  companyIdInput: string,
): Promise<OrderActionResult> {
  if (!z.string().uuid().safeParse(companyIdInput).success) {
    return { ok: false, error: "Geçersiz istek." };
  }
  const { companyId } = await requireCompanyRole(companyIdInput, ORDER_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("sales_orders")
    .update({ seen_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .is("seen_at", null)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };

  revalidatePath(companyModulePath(companyId, "sales-orders"));
  revalidatePath(companyModulePath(companyId));
  return { ok: true };
}

export type ConvertResult =
  | { ok: true; shipmentId: string; code: string }
  | { ok: false; error: string };

async function nextShipmentCode(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  companyId: string,
): Promise<string> {
  const { data } = await supabase
    .from("shipments")
    .select("code")
    .eq("company_id", companyId)
    .like("code", "SVK-%");
  const max = (data ?? []).reduce((cur, row) => {
    const m = row.code.match(/^SVK-(\d+)$/i);
    return m ? Math.max(cur, Number(m[1])) : cur;
  }, 0);
  return `SVK-${String(max + 1).padStart(6, "0")}`;
}

// F4: B2B siparisi mevcut sevkiyat akisina donusturur. Her kalem icin FEFO
// (en yakin SKT once) sirasiyla serbest lotlardan tahsis yapar: kendi urunlerde
// musteri mali olmayan lotlar, fason urunlerde o musterinin mali olan lotlar.
// SVK sevkiyati + kalemlerini olusturur ve siparise baglar. Stok dusumu hala
// Sevkiyat ekranindaki "Sevk Et" (ship_shipment) ile olur.
export async function convertOrderToShipment(
  companyIdInput: string,
  orderIdInput: string,
): Promise<ConvertResult> {
  const parsed = z
    .object({ company: z.string().uuid(), order: z.string().uuid() })
    .safeParse({ company: companyIdInput, order: orderIdInput });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company,
    SHIPMENT_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: order } = await supabase
    .from("sales_orders")
    .select(
      "id, code, status, customer_id, shipment_id, " +
        "sales_order_items(material_id, quantity)",
    )
    .eq("id", parsed.data.order)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      code: string;
      status: string;
      customer_id: string;
      shipment_id: string | null;
      sales_order_items: Array<{ material_id: string; quantity: number }> | null;
    }>();

  if (!order) return { ok: false, error: "Sipariş bulunamadı." };
  if (order.shipment_id) {
    return { ok: false, error: "Bu sipariş zaten sevkiyata dönüştürülmüş." };
  }
  if (order.status === "cancelled" || order.status === "shipped") {
    return { ok: false, error: "Kapanmış sipariş sevkiyata dönüştürülemez." };
  }
  const items = order.sales_order_items ?? [];
  if (items.length === 0) return { ok: false, error: "Siparişte kalem yok." };

  const { data: itemMats } = await supabase
    .from("materials")
    .select("id, fason_customer_id")
    .eq("company_id", companyId)
    .in("id", [...new Set(items.map((i) => i.material_id))]);
  const fasonOwnerByMaterial = new Map(
    (itemMats ?? []).map((m) => [m.id, m.fason_customer_id as string | null]),
  );

  // FEFO allocation per material. Own products draw from factory-owned lots;
  // fason products draw from that customer's customer-owned lots.
  const allocations: Array<{ lot_id: string; material_id: string; quantity: number }> = [];
  for (const item of items) {
    const fasonOwner = fasonOwnerByMaterial.get(item.material_id) ?? null;
    if (fasonOwner && fasonOwner !== order.customer_id) {
      return {
        ok: false,
        error:
          "Siparişte başka bir fason müşterisine ait ürün var; sevkiyata dönüştürülemedi.",
      };
    }

    let lotQuery = supabase
      .from("material_lots")
      .select("id, quantity_on_hand, expiry_date, created_at")
      .eq("company_id", companyId)
      .eq("material_id", item.material_id)
      .eq("status", "released")
      .is("deleted_at", null)
      .gt("quantity_on_hand", 0);
    lotQuery = fasonOwner
      ? lotQuery.eq("owner_customer_id", fasonOwner)
      : lotQuery.is("owner_customer_id", null);
    const { data: lots } = await lotQuery
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    let remaining = Number(item.quantity);
    for (const lot of lots ?? []) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(lot.quantity_on_hand));
      allocations.push({
        lot_id: lot.id,
        material_id: item.material_id,
        quantity: take,
      });
      remaining -= take;
    }
    if (remaining > 0) {
      return {
        ok: false,
        error: `Yetersiz stok: bir ürün için ${remaining.toLocaleString("tr-TR")} adet eksik. Sevkiyata dönüştürülemedi.`,
      };
    }
  }

  const code = await nextShipmentCode(supabase, companyId);
  const { data: shipment, error: shipErr } = await supabase
    .from("shipments")
    .insert({
      company_id: companyId,
      code,
      channel: "ecza",
      customer_id: order.customer_id,
      notes: `${order.code} portal siparişinden oluşturuldu`,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (shipErr || !shipment) {
    return { ok: false, error: shipErr?.message ?? "Sevkiyat oluşturulamadı." };
  }

  const { error: itemsErr } = await supabase.from("shipment_items").insert(
    allocations.map((a) => ({
      company_id: companyId,
      shipment_id: shipment.id,
      lot_id: a.lot_id,
      material_id: a.material_id,
      quantity: a.quantity,
      created_by: ctx.userId,
    })),
  );
  if (itemsErr) {
    await supabase.from("shipments").delete().eq("id", shipment.id);
    return { ok: false, error: itemsErr.message };
  }

  await supabase
    .from("sales_orders")
    .update({
      shipment_id: shipment.id,
      status: "preparing",
      seen_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", order.id)
    .eq("company_id", companyId);

  revalidatePath(companyModulePath(companyId, "sales-orders"));
  revalidatePath(companyModulePath(companyId, "shipments"));
  revalidatePath(companyModulePath(companyId));
  return { ok: true, shipmentId: shipment.id, code };
}

// F5: bolge muduru eczaneler adina siparis girer (source='rep'). Kalemler
// product_catalog'a (is_listed) karsi denetlenir, fiyat snapshot alinir.
const repItemSchema = z.object({
  material_id: z.string().uuid(),
  quantity: z.number().int().positive().max(1_000_000),
});
const repOrderSchema = z.object({
  company: z.string().uuid(),
  customer_id: z.string().uuid("Müşteri seçin."),
  items: z.array(repItemSchema).min(1, "Sepet boş.").max(100),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type PlaceRepOrderResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

export async function placeRepOrder(
  companyIdInput: string,
  customerIdInput: string,
  itemsInput: Array<{ material_id: string; quantity: number }>,
  notesInput: string,
): Promise<PlaceRepOrderResult> {
  const parsed = repOrderSchema.safeParse({
    company: companyIdInput,
    customer_id: customerIdInput,
    items: itemsInput,
    notes: notesInput,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Geçersiz sipariş." };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company,
    ORDER_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  // Customer must belong to this company.
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("id", parsed.data.customer_id)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!customer) return { ok: false, error: "Müşteri bu firmaya ait değil." };

  // Listed catalog + price snapshot.
  const { data: catalog } = await supabase
    .from("product_catalog")
    .select("material_id, sale_price")
    .eq("company_id", companyId)
    .eq("is_listed", true)
    .is("deleted_at", null);
  const priceById = new Map(
    (catalog ?? []).map((c) => [c.material_id, c.sale_price]),
  );

  for (const item of parsed.data.items) {
    if (!priceById.has(item.material_id)) {
      return { ok: false, error: "Sepette listede olmayan bir ürün var." };
    }
  }

  const { data: order, error: orderError } = await supabase
    .from("sales_orders")
    .insert({
      company_id: companyId,
      customer_id: parsed.data.customer_id,
      code: await nextSalesOrderCode(supabase, companyId),
      status: "placed",
      source: "rep",
      placed_by: ctx.userId,
      notes: parsed.data.notes || null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id, code")
    .single();
  if (orderError || !order) {
    return { ok: false, error: orderError?.message ?? "Sipariş oluşturulamadı." };
  }

  const { error: itemsError } = await supabase.from("sales_order_items").insert(
    parsed.data.items.map((item) => ({
      company_id: companyId,
      order_id: order.id,
      material_id: item.material_id,
      quantity: item.quantity,
      unit_price: priceById.get(item.material_id) ?? null,
      created_by: ctx.userId,
    })),
  );
  if (itemsError) {
    await supabase.from("sales_orders").delete().eq("id", order.id);
    return { ok: false, error: itemsError.message };
  }

  revalidatePath(companyModulePath(companyId, "sales-orders"));
  revalidatePath(companyModulePath(companyId));
  return { ok: true, code: order.code };
}

// Manuel iç müşteri siparişi (fason/toptan): herhangi bir BİTMİŞ ürün kabul eder
// (portal kataloğuyla sınırlı değil), source='manual'. MRP bu açık talebi patlatır.
const manualOrderSchema = z.object({
  company: z.string().uuid(),
  customer_id: z.string().uuid("Müşteri seçin."),
  items: z
    .array(
      z.object({
        material_id: z.string().uuid(),
        quantity: z.number().positive().max(10_000_000),
      }),
    )
    .min(1, "En az bir ürün girin.")
    .max(100),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function placeManualOrder(
  companyIdInput: string,
  customerIdInput: string,
  itemsInput: Array<{ material_id: string; quantity: number }>,
  notesInput: string,
): Promise<PlaceRepOrderResult> {
  const parsed = manualOrderSchema.safeParse({
    company: companyIdInput,
    customer_id: customerIdInput,
    items: itemsInput,
    notes: notesInput,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Geçersiz sipariş." };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company,
    ORDER_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("id", parsed.data.customer_id)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!customer) return { ok: false, error: "Müşteri bu firmaya ait değil." };

  // Validate materials are finished goods of this company.
  const ids = [...new Set(parsed.data.items.map((i) => i.material_id))];
  const { data: mats } = await supabase
    .from("materials")
    .select("id, type")
    .eq("company_id", companyId)
    .in("id", ids)
    .is("deleted_at", null);
  const finishedIds = new Set(
    (mats ?? []).filter((m) => m.type === "finished").map((m) => m.id),
  );
  for (const item of parsed.data.items) {
    if (!finishedIds.has(item.material_id)) {
      return { ok: false, error: "Sipariş yalnızca bitmiş ürün içerebilir." };
    }
  }

  // Optional price snapshot from catalog.
  const { data: catalog } = await supabase
    .from("product_catalog")
    .select("material_id, sale_price")
    .eq("company_id", companyId)
    .is("deleted_at", null);
  const priceById = new Map((catalog ?? []).map((c) => [c.material_id, c.sale_price]));

  const { data: order, error: orderError } = await supabase
    .from("sales_orders")
    .insert({
      company_id: companyId,
      customer_id: parsed.data.customer_id,
      code: await nextSalesOrderCode(supabase, companyId),
      status: "placed",
      source: "manual",
      placed_by: ctx.userId,
      notes: parsed.data.notes || null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id, code")
    .single();
  if (orderError || !order) {
    return { ok: false, error: orderError?.message ?? "Sipariş oluşturulamadı." };
  }

  const { error: itemsError } = await supabase.from("sales_order_items").insert(
    parsed.data.items.map((item) => ({
      company_id: companyId,
      order_id: order.id,
      material_id: item.material_id,
      quantity: item.quantity,
      unit_price: priceById.get(item.material_id) ?? null,
      created_by: ctx.userId,
    })),
  );
  if (itemsError) {
    await supabase.from("sales_orders").delete().eq("id", order.id);
    return { ok: false, error: itemsError.message };
  }

  revalidatePath(companyModulePath(companyId, "sales-orders"));
  revalidatePath(companyModulePath(companyId, "mrp"));
  revalidatePath(companyModulePath(companyId));
  return { ok: true, code: order.code };
}

async function nextSalesOrderCode(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  companyId: string,
): Promise<string> {
  const { data } = await supabase
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

const STATUS_VALUES = ["confirmed", "preparing", "cancelled"] as const;

// Durum gecisi. Sevkiyata donusturme (status=shipped) ayri bir akista (F4).
export async function setSalesOrderStatus(
  companyIdInput: string,
  orderIdInput: string,
  statusInput: (typeof STATUS_VALUES)[number],
): Promise<OrderActionResult> {
  const parsed = z
    .object({
      company: z.string().uuid(),
      order: z.string().uuid(),
      status: z.enum(STATUS_VALUES),
    })
    .safeParse({
      company: companyIdInput,
      order: orderIdInput,
      status: statusInput,
    });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company,
    ORDER_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: order } = await supabase
    .from("sales_orders")
    .select("status")
    .eq("id", parsed.data.order)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!order) return { ok: false, error: "Sipariş bulunamadı." };
  if (order.status === "shipped" || order.status === "cancelled") {
    return { ok: false, error: "Bu sipariş kapanmış; durumu değiştirilemez." };
  }

  const { error } = await supabase
    .from("sales_orders")
    .update({
      status: parsed.data.status,
      seen_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", parsed.data.order)
    .eq("company_id", companyId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(companyModulePath(companyId, "sales-orders"));
  revalidatePath(companyModulePath(companyId));
  return { ok: true };
}
