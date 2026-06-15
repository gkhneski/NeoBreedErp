import { requireModuleAccess } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import {
  SalesVisuals,
  type ProductCard,
  type RevenueBar,
  type SalesKpis,
} from "./sales-visuals";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type OrderRow = {
  order_number: string;
  order_date: string | null;
  total_price: number | null;
  status: string | null;
  lines: Array<{ name?: string; quantity?: number; barcode?: string }> | null;
};

type RemoteRow = { barcode: string; title: string | null; image_url: string | null };
type ListingRow = {
  barcode: string;
  normal_sale_price: number | null;
  applied_sale_price: number | null;
  material_id: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function SalesPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireModuleAccess(routeCompanyId, "sales");
  const supabase = await createServerSupabaseClient();

  const now = new Date();
  const since90 = new Date(now.getTime() - 90 * DAY_MS);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);

  const [{ data: orders }, { data: remotes }, { data: listings }] =
    await Promise.all([
      supabase
        .from("marketplace_orders")
        .select("order_number, order_date, total_price, status, lines")
        .eq("company_id", companyId)
        .eq("channel", "trendyol")
        .gte("order_date", since90.toISOString())
        .order("order_date", { ascending: false })
        .limit(5000)
        .returns<OrderRow[]>(),
      supabase
        .from("marketplace_remote_products")
        .select("barcode, title, image_url")
        .eq("company_id", companyId)
        .eq("channel", "trendyol")
        .returns<RemoteRow[]>(),
      supabase
        .from("marketplace_listings")
        .select("barcode, normal_sale_price, applied_sale_price, material_id")
        .eq("company_id", companyId)
        .eq("channel", "trendyol")
        .is("deleted_at", null)
        .returns<ListingRow[]>(),
    ]);

  const orderRows = orders ?? [];

  // KPIs over the last 30 days.
  let revenue = 0;
  let orderCount = 0;
  let units = 0;
  // Per-barcode units sold in the last 30 days + a fallback title from the line.
  const unitsByBarcode = new Map<string, number>();
  const nameByBarcode = new Map<string, string>();
  // Daily revenue for the last 14 days.
  const dailyBuckets = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    dailyBuckets.set(dayKey(new Date(now.getTime() - i * DAY_MS)), 0);
  }

  for (const o of orderRows) {
    const when = o.order_date ? new Date(o.order_date) : null;
    const price = Number(o.total_price ?? 0);
    if (when && when >= since30) {
      revenue += price;
      orderCount += 1;
      for (const l of o.lines ?? []) {
        const qty = Number(l.quantity ?? 0);
        units += qty;
        const bc = (l.barcode ?? "").trim();
        if (bc) {
          unitsByBarcode.set(bc, (unitsByBarcode.get(bc) ?? 0) + qty);
          if (l.name && !nameByBarcode.has(bc)) nameByBarcode.set(bc, l.name);
        }
      }
    }
    if (when) {
      const key = dayKey(when);
      if (dailyBuckets.has(key)) {
        dailyBuckets.set(key, (dailyBuckets.get(key) ?? 0) + price);
      }
    }
  }

  const kpis: SalesKpis = {
    revenue,
    orders: orderCount,
    units,
    avgBasket: orderCount > 0 ? revenue / orderCount : 0,
  };

  const revenueSeries: RevenueBar[] = Array.from(dailyBuckets.entries()).map(
    ([key, value]) => {
      const d = new Date(`${key}T00:00:00`);
      return {
        label: d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" }),
        value: Math.round(value),
      };
    },
  );

  // Sellable stock per material (released, not reserved to a customer).
  const listingRows = listings ?? [];
  const materialIds = Array.from(new Set(listingRows.map((l) => l.material_id)));
  const stockByMaterial = new Map<string, number>();
  if (materialIds.length > 0) {
    const { data: lots } = await supabase
      .from("material_lots")
      .select("material_id, quantity_on_hand")
      .eq("company_id", companyId)
      .in("material_id", materialIds)
      .eq("status", "released")
      .is("owner_customer_id", null)
      .is("deleted_at", null)
      .gt("quantity_on_hand", 0);
    for (const lot of lots ?? []) {
      stockByMaterial.set(
        lot.material_id,
        (stockByMaterial.get(lot.material_id) ?? 0) +
          Number(lot.quantity_on_hand),
      );
    }
  }
  const listingByBarcode = new Map(listingRows.map((l) => [l.barcode, l]));

  // Product cards: start from the catalog (images), then add any sold barcode
  // missing from it. Each card carries 30-day units, price and sellable stock.
  const cards = new Map<string, ProductCard>();
  for (const r of remotes ?? []) {
    const listing = listingByBarcode.get(r.barcode);
    cards.set(r.barcode, {
      barcode: r.barcode,
      title: r.title ?? nameByBarcode.get(r.barcode) ?? "—",
      imageUrl: r.image_url,
      units: unitsByBarcode.get(r.barcode) ?? 0,
      price: listing ? Number(listing.normal_sale_price ?? 0) : null,
      appliedPrice:
        listing && listing.applied_sale_price !== null
          ? Number(listing.applied_sale_price)
          : null,
      stock: listing ? stockByMaterial.get(listing.material_id) ?? 0 : null,
    });
  }
  for (const [bc, u] of unitsByBarcode) {
    if (cards.has(bc)) continue;
    const listing = listingByBarcode.get(bc);
    cards.set(bc, {
      barcode: bc,
      title: nameByBarcode.get(bc) ?? "—",
      imageUrl: null,
      units: u,
      price: listing ? Number(listing.normal_sale_price ?? 0) : null,
      appliedPrice:
        listing && listing.applied_sale_price !== null
          ? Number(listing.applied_sale_price)
          : null,
      stock: listing ? stockByMaterial.get(listing.material_id) ?? 0 : null,
    });
  }

  const products = Array.from(cards.values()).sort(
    (a, b) => b.units - a.units || a.title.localeCompare(b.title, "tr"),
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Satış & Ürünler</h1>
        <p className="text-sm text-muted-foreground">
          Son 30 günün Trendyol satış özeti ve ürün performansı. Resme tıklayınca
          büyür.
        </p>
      </header>

      <SalesVisuals
        kpis={kpis}
        revenueSeries={revenueSeries}
        products={products}
      />
    </div>
  );
}
