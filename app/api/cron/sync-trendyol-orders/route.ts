import { getMarketplaceConnection } from "@/lib/marketplaces/connections";
import { getOrders } from "@/lib/marketplaces/trendyol";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 7/24 Trendyol siparis senkronu — kimsenin panelde olmasina gerek kalmadan.
// Her aktif Trendyol baglantisi icin son siparisleri ceker, marketplace_orders'a
// upsert eder (seen_at'e dokunmaz; yeni siparisler "gorulmemis" kalir, bildirim
// ve liste otomatik guncellenir).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const service = createServiceRoleClient();
  const { data: connections } = await service
    .from("marketplace_connections")
    .select("company_id")
    .eq("channel", "trendyol")
    .eq("enabled", true);

  const fetchedAt = new Date().toISOString();
  const results: Array<{ companyId: string; pulled: number; error?: string }> = [];

  for (const row of connections ?? []) {
    const companyId = row.company_id;
    try {
      const connection = await getMarketplaceConnection(companyId, "trendyol");
      if (!connection) {
        results.push({ companyId, pulled: 0, error: "no connection" });
        continue;
      }
      const orders = await getOrders(connection);
      if (orders.length > 0) {
        await service.from("marketplace_orders").upsert(
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
      results.push({ companyId, pulled: orders.length });
    } catch (error) {
      results.push({
        companyId,
        pulled: 0,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return Response.json({ ok: true, fetchedAt, results });
}
