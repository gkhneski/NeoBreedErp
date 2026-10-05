import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { MarketplaceChannel } from "@/types/database";

import { SHIPPED_STATUSES } from "./order-status";

export type AutoShipRun = {
  enabled: boolean;
  shipped: number;
  manual: number;
  failed: number;
};

// DIKKAT: servis rolu RLS'i atlar. Cron (sistem baglami) veya guard'dan gecmis
// bir server action cagirir. Sadece auto_ship acik firmalar icin calisir ve
// yalnizca acildigi andan sonraki, pazaryerinin "kargoya verildi" dedigi
// siparisleri duser. Basarisiz olanlar her calismada yeniden denenir (depocu
// sayimi bitirince kendiliginden gecer).
export async function runAutoShip(
  companyId: string,
  channel: MarketplaceChannel = "trendyol",
): Promise<AutoShipRun> {
  const service = createServiceRoleClient();
  const result: AutoShipRun = { enabled: false, shipped: 0, manual: 0, failed: 0 };

  const { data: conn } = await service
    .from("marketplace_connections")
    .select("auto_ship, auto_ship_enabled_at")
    .eq("company_id", companyId)
    .eq("channel", channel)
    .eq("enabled", true)
    .maybeSingle();

  if (!conn?.auto_ship || !conn.auto_ship_enabled_at) return result;
  result.enabled = true;

  const { data: orders } = await service
    .from("marketplace_orders")
    .select("order_number")
    .eq("company_id", companyId)
    .eq("channel", channel)
    .is("shipment_id", null)
    .in("status", [...SHIPPED_STATUSES])
    .gte("order_date", conn.auto_ship_enabled_at)
    .order("order_date", { ascending: true })
    .limit(100);

  for (const order of orders ?? []) {
    const outcome = await autoShipOne(companyId, channel, order.order_number);
    if (outcome === "shipped") result.shipped += 1;
    else if (outcome === "manual") result.manual += 1;
    else if (outcome === "failed") result.failed += 1;
  }

  return result;
}

export async function autoShipOne(
  companyId: string,
  channel: MarketplaceChannel,
  orderNumber: string,
): Promise<"shipped" | "manual" | "already" | "failed"> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("auto_ship_marketplace_order", {
    p_company_id: companyId,
    p_channel: channel,
    p_order_number: orderNumber,
  });

  if (error) {
    await service
      .from("marketplace_orders")
      .update({
        auto_ship_status: "failed",
        auto_ship_error: error.message.slice(0, 500),
        auto_ship_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("channel", channel)
      .eq("order_number", orderNumber)
      .is("shipment_id", null);
    return "failed";
  }

  return (data as "shipped" | "manual" | "already") ?? "already";
}
