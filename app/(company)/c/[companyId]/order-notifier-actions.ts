"use server";

import { z } from "zod";

import { requireCompanyUser } from "@/lib/auth";
import { getMarketplaceConnection } from "@/lib/marketplaces/connections";
import { getOrders } from "@/lib/marketplaces/trendyol";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type NewOrder = {
  order_number: string;
  status: string | null;
  customer_name: string | null;
  order_date: string | null;
  summary: string;
};

export type SyncResult =
  | { ok: true; orders: NewOrder[] }
  | { ok: false };

// Polls Trendyol, caches recent orders, returns the ones the depot hasn't seen.
export async function syncTrendyolOrders(
  companyIdInput: string,
): Promise<SyncResult> {
  if (!z.string().uuid().safeParse(companyIdInput).success) return { ok: false };
  const { companyId } = await requireCompanyUser(companyIdInput);

  const connection = await getMarketplaceConnection(companyId, "trendyol");
  if (!connection) return { ok: true, orders: [] };

  const supabase = await createServerSupabaseClient();

  try {
    const orders = await getOrders(connection);
    const fetchedAt = new Date().toISOString();
    if (orders.length > 0) {
      // seen_at intentionally omitted so existing rows keep their handled state.
      await supabase.from("marketplace_orders").upsert(
        orders.map((o) => ({
          company_id: companyId,
          channel: "trendyol" as const,
          order_number: o.orderNumber,
          status: o.status || null,
          customer_name: o.customerName || null,
          order_date: o.orderDate,
          total_price: o.totalPrice,
          lines: o.lines,
          fetched_at: fetchedAt,
        })),
        { onConflict: "company_id,channel,order_number" },
      );
    }
  } catch {
    // Network/Trendyol hiccup: fall through and just return whatever is unseen.
  }

  const { data: unseen } = await supabase
    .from("marketplace_orders")
    .select("order_number, status, customer_name, order_date, lines")
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .is("seen_at", null)
    .order("order_date", { ascending: false, nullsFirst: false })
    .limit(50)
    .returns<
      Array<{
        order_number: string;
        status: string | null;
        customer_name: string | null;
        order_date: string | null;
        lines: Array<{ name: string; quantity: number }> | null;
      }>
    >();

  const result: NewOrder[] = (unseen ?? []).map((o) => ({
    order_number: o.order_number,
    status: o.status,
    customer_name: o.customer_name,
    order_date: o.order_date,
    summary: (o.lines ?? [])
      .map((l) => `${l.name} x${l.quantity}`)
      .join(", ")
      .slice(0, 140),
  }));

  return { ok: true, orders: result };
}

export async function markOrderSeen(
  companyIdInput: string,
  orderNumber: string,
): Promise<void> {
  const { companyId } = await requireCompanyUser(companyIdInput);
  const supabase = await createServerSupabaseClient();
  await supabase
    .from("marketplace_orders")
    .update({ seen_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .eq("order_number", orderNumber)
    .is("seen_at", null);
}

export async function markAllOrdersSeen(companyIdInput: string): Promise<void> {
  const { companyId } = await requireCompanyUser(companyIdInput);
  const supabase = await createServerSupabaseClient();
  await supabase
    .from("marketplace_orders")
    .update({ seen_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .is("seen_at", null);
}
