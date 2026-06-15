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
  searchParams: Promise<{ urun?: string }>;
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
type MaterialRow = {
  id: string;
  name: string;
  barcode: string | null;
  base_uom: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function SalesPage({ params, searchParams }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { urun: highlightId } = await searchParams;
  const { companyId } = await requireModuleAccess(routeCompanyId, "sales");
  const supabase = await createServerSupabaseClient();

  const now = new Date();
  const since90 = new Date(now.getTime() - 90 * DAY_MS);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);

  const [{ data: orders }, { data: remotes }, { data: listings }, { data: materials }] =
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
      supabase
        .from("materials")
        .select("id, name, barcode, base_uom")
        .eq("company_id", companyId)
        .eq("type", "finished")
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .returns<MaterialRow[]>(),
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

  // Sellable stock per finished material (released, not reserved to a customer).
  const stockByMaterial = new Map<string, number>();
  {
    const { data: lots } = await supabase
      .from("material_lots")
      .select("material_id, quantity_on_hand, materials:material_id!inner(type)")
      .eq("company_id", companyId)
      .eq("materials.type", "finished")
      .eq("status", "released")
      .is("owner_customer_id", null)
      .is("deleted_at", null)
      .gt("quantity_on_hand", 0)
      .returns<Array<{ material_id: string; quantity_on_hand: number }>>();
    for (const lot of lots ?? []) {
      stockByMaterial.set(
        lot.material_id,
        (stockByMaterial.get(lot.material_id) ?? 0) +
          Number(lot.quantity_on_hand),
      );
    }
  }

  const remoteByBarcode = new Map((remotes ?? []).map((r) => [r.barcode, r]));
  const listingByMaterial = new Map(
    (listings ?? []).map((l) => [l.material_id, l]),
  );

  // One card per real finished product. Image comes from the Trendyol catalog
  // (matched on the product barcode), 30-day units from order lines, price from
  // the listing, and stock from released lots. Keyed by material id so the
  // dashboard "Acil" banner can deep-link straight to a product.
  const products: ProductCard[] = (materials ?? [])
    .map((m) => {
      const bc = (m.barcode ?? "").trim();
      const remote = bc ? remoteByBarcode.get(bc) : undefined;
      const listing = listingByMaterial.get(m.id);
      return {
        id: m.id,
        barcode: bc,
        title: m.name,
        imageUrl: remote?.image_url ?? null,
        units: bc ? unitsByBarcode.get(bc) ?? 0 : 0,
        price: listing ? Number(listing.normal_sale_price ?? 0) : null,
        appliedPrice:
          listing && listing.applied_sale_price !== null
            ? Number(listing.applied_sale_price)
            : null,
        stock: stockByMaterial.get(m.id) ?? 0,
      };
    })
    .sort((a, b) => b.units - a.units || a.title.localeCompare(b.title, "tr"));

  const validHighlight =
    highlightId && products.some((p) => p.id === highlightId)
      ? highlightId
      : null;

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
        highlightId={validHighlight}
      />
    </div>
  );
}
