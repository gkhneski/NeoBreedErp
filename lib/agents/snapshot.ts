import "server-only";

import { daysUntil } from "@/lib/expiry";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type SnapshotItem = {
  ref: string;
  materialId: string;
  listingId: string | null;
  name: string;
  barcode: string | null;
  salePrice: number | null;
  listPrice: number | null;
  stock: number;
  sold30d: number;
  sold30dPrev: number;
  hasImage: boolean;
  approved: boolean | null;
  onSale: boolean | null;
  isListed: boolean;
  hasSitePage: boolean;
  daysToExpiry: number | null;
  flags: string[];
};

export type BusinessSnapshot = {
  companyName: string;
  generatedAt: string;
  totals: {
    products: number;
    listed: number;
    publishedSitePages: number;
    withImage: number;
    outOfStock: number;
    zeroSales30d: number;
    noSitePage: number;
    unapproved: number;
  };
  trend: { sold30d: number; sold30dPrev: number; orders30d: number };
  items: SnapshotItem[];
};

const SKT_NEAR_DAYS = 90;
const MAX_ITEMS = 40;

// Deterministic business briefing the agents reason over — real numbers, never
// hallucination. Each item carries a stable `ref` (P1…) so agents reference
// products by ref and the orchestrator resolves real ids when creating actions.
export async function gatherBusinessSnapshot(
  companyId: string,
): Promise<BusinessSnapshot> {
  const supabase = createServiceRoleClient();

  const [{ data: company }, { data: materials }] = await Promise.all([
    supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
    supabase
      .from("materials")
      .select("id, name, barcode")
      .eq("company_id", companyId)
      .eq("type", "finished")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .returns<Array<{ id: string; name: string; barcode: string | null }>>(),
  ]);

  const products = materials ?? [];
  const materialIds = products.map((m) => m.id);
  const barcodes = products.map((m) => m.barcode).filter(Boolean) as string[];

  const [
    { data: listings },
    { data: remotes },
    { data: lots },
    { data: pages },
    orders30,
    ordersPrev,
  ] = await Promise.all([
    supabase
      .from("marketplace_listings")
      .select("id, material_id, title, normal_sale_price, normal_list_price")
      .eq("company_id", companyId)
      .eq("channel", "trendyol")
      .is("deleted_at", null)
      .returns<
        Array<{
          id: string;
          material_id: string;
          title: string | null;
          normal_sale_price: number;
          normal_list_price: number | null;
        }>
      >(),
    barcodes.length
      ? supabase
          .from("marketplace_remote_products")
          .select("barcode, image_url, approved, on_sale")
          .eq("company_id", companyId)
          .eq("channel", "trendyol")
          .in("barcode", barcodes)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    materialIds.length
      ? supabase
          .from("material_lots")
          .select("material_id, quantity_on_hand, expiry_date")
          .eq("company_id", companyId)
          .in("material_id", materialIds)
          .eq("status", "released")
          .is("owner_customer_id", null)
          .is("deleted_at", null)
          .gt("quantity_on_hand", 0)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    supabase
      .from("site_product_pages")
      .select("material_id, status")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .returns<Array<{ material_id: string; status: string }>>(),
    ordersWindow(supabase, companyId, 30, 0),
    ordersWindow(supabase, companyId, 60, 30),
  ]);

  const listingByMaterial = new Map(
    (listings ?? []).map((l) => [l.material_id, l]),
  );
  const remoteByBarcode = new Map(
    (remotes ?? []).map((r) => [
      String((r as { barcode: string }).barcode),
      r as { image_url: string | null; approved: boolean | null; on_sale: boolean | null },
    ]),
  );
  const stockByMaterial = new Map<string, number>();
  const expiryByMaterial = new Map<string, string>();
  for (const l of (lots ?? []) as Array<{
    material_id: string;
    quantity_on_hand: number;
    expiry_date: string | null;
  }>) {
    stockByMaterial.set(
      l.material_id,
      (stockByMaterial.get(l.material_id) ?? 0) + Number(l.quantity_on_hand),
    );
    if (l.expiry_date) {
      const cur = expiryByMaterial.get(l.material_id);
      if (!cur || l.expiry_date < cur) expiryByMaterial.set(l.material_id, l.expiry_date);
    }
  }
  const pageByMaterial = new Map((pages ?? []).map((p) => [p.material_id, p.status]));

  const sold30 = soldByBarcode(orders30.lines);
  const soldPrev = soldByBarcode(ordersPrev.lines);

  const items: SnapshotItem[] = products.slice(0, MAX_ITEMS).map((m, i) => {
    const listing = listingByMaterial.get(m.id) ?? null;
    const remote = m.barcode ? remoteByBarcode.get(m.barcode) : undefined;
    const stock = stockByMaterial.get(m.id) ?? 0;
    const s30 = m.barcode ? sold30.get(m.barcode) ?? 0 : 0;
    const sPrev = m.barcode ? soldPrev.get(m.barcode) ?? 0 : 0;
    const hasImage = Boolean(remote?.image_url);
    const approved = remote?.approved ?? null;
    const onSale = remote?.on_sale ?? null;
    const isListed = Boolean(listing);
    const pageStatus = pageByMaterial.get(m.id);
    const hasSitePage = pageStatus === "published";
    const daysToExpiry = expiryByMaterial.has(m.id)
      ? daysUntil(expiryByMaterial.get(m.id)!)
      : null;

    const flags: string[] = [];
    if (isListed && stock <= 0) flags.push("stok yok ama Trendyol'da listede");
    if (stock <= 0 && !isListed) flags.push("stok yok");
    if (isListed && s30 === 0) flags.push("son 30 günde satış yok");
    if (isListed && !hasImage) flags.push("görsel eksik");
    if (isListed && approved === false) flags.push("Trendyol'da onaysız");
    if (!isListed) flags.push("Trendyol'a listelenmemiş");
    if (!hasSitePage) flags.push("web sayfası yok");
    if (daysToExpiry !== null && daysToExpiry <= SKT_NEAR_DAYS)
      flags.push(`SKT yakın (${daysToExpiry} gün)`);
    if (isListed && listing && (listing.normal_list_price === null ||
        Number(listing.normal_list_price) <= Number(listing.normal_sale_price)))
      flags.push("üstü çizili liste fiyatı yok");

    return {
      ref: `P${i + 1}`,
      materialId: m.id,
      listingId: listing?.id ?? null,
      name: m.name,
      barcode: m.barcode,
      salePrice: listing ? Number(listing.normal_sale_price) : null,
      listPrice: listing?.normal_list_price ?? null,
      stock,
      sold30d: s30,
      sold30dPrev: sPrev,
      hasImage,
      approved,
      onSale,
      isListed,
      hasSitePage,
      daysToExpiry,
      flags,
    };
  });

  const totals = {
    products: products.length,
    listed: items.filter((i) => i.isListed).length,
    publishedSitePages: (pages ?? []).filter((p) => p.status === "published").length,
    withImage: items.filter((i) => i.hasImage).length,
    outOfStock: items.filter((i) => i.stock <= 0).length,
    zeroSales30d: items.filter((i) => i.isListed && i.sold30d === 0).length,
    noSitePage: items.filter((i) => !i.hasSitePage).length,
    unapproved: items.filter((i) => i.approved === false).length,
  };

  const sold30dTotal = [...sold30.values()].reduce((a, b) => a + b, 0);
  const soldPrevTotal = [...soldPrev.values()].reduce((a, b) => a + b, 0);

  return {
    companyName: company?.name ?? "Firma",
    generatedAt: new Date().toISOString(),
    totals,
    trend: {
      sold30d: sold30dTotal,
      sold30dPrev: soldPrevTotal,
      orders30d: orders30.count,
    },
    items,
  };
}

async function ordersWindow(
  supabase: ReturnType<typeof createServiceRoleClient>,
  companyId: string,
  fromDaysAgo: number,
  toDaysAgo: number,
): Promise<{ lines: Array<{ barcode?: string; quantity?: number }>; count: number }> {
  const from = new Date();
  from.setDate(from.getDate() - fromDaysAgo);
  const to = new Date();
  to.setDate(to.getDate() - toDaysAgo);
  const { data } = await supabase
    .from("marketplace_orders")
    .select("lines, order_date")
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .gte("order_date", from.toISOString())
    .lt("order_date", to.toISOString())
    .limit(2000);
  const rows = data ?? [];
  const lines: Array<{ barcode?: string; quantity?: number }> = [];
  for (const o of rows) {
    const ls = (o.lines as Array<{ barcode?: string; quantity?: number }> | null) ?? [];
    lines.push(...ls);
  }
  return { lines, count: rows.length };
}

function soldByBarcode(
  lines: Array<{ barcode?: string; quantity?: number }>,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines) {
    if (!l.barcode) continue;
    m.set(l.barcode, (m.get(l.barcode) ?? 0) + Number(l.quantity ?? 0));
  }
  return m;
}
