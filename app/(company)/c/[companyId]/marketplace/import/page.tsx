import Link from "next/link";
import { redirect } from "next/navigation";

import { requireCompanyRole } from "@/lib/auth";
import { getMarketplaceConnection } from "@/lib/marketplaces/connections";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MARKETPLACE_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { CatalogRefresher } from "./catalog-refresher";
import { ImportMapper, type RemoteRow } from "./import-mapper";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type CacheRow = {
  barcode: string;
  title: string | null;
  image_url: string | null;
  stock_code: string | null;
  sale_price: number | null;
  list_price: number | null;
  quantity: number | null;
  approved: boolean | null;
  on_sale: boolean | null;
  fetched_at: string;
};

export default async function MarketplaceImportPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    MARKETPLACE_WRITE_ROLES,
  );

  const connection = await getMarketplaceConnection(companyId, "trendyol");
  if (!connection) {
    redirect(companyModulePath(companyId, "settings", "marketplaces"));
  }

  const supabase = await createServerSupabaseClient();
  const [{ data: cached }, { data: existing }, { data: materials }] =
    await Promise.all([
      supabase
        .from("marketplace_remote_products")
        .select(
          "barcode, title, image_url, stock_code, sale_price, list_price, quantity, approved, on_sale, fetched_at",
        )
        .eq("company_id", companyId)
        .eq("channel", "trendyol")
        .order("title", { ascending: true })
        .returns<CacheRow[]>(),
      supabase
        .from("marketplace_listings")
        .select("id, barcode, material_id, materials:material_id(code, name)")
        .eq("company_id", companyId)
        .eq("channel", "trendyol")
        .is("deleted_at", null)
        .returns<
          Array<{
            id: string;
            barcode: string;
            material_id: string;
            materials: { code: string; name: string } | null;
          }>
        >(),
      supabase
        .from("materials")
        .select("id, code, name")
        .eq("company_id", companyId)
        .eq("type", "finished")
        .is("fason_customer_id", null)
        .is("deleted_at", null)
        .order("code"),
    ]);

  const cachedRows = cached ?? [];
  const mappedByBarcode = new Map(
    (existing ?? []).map((row) => [
      row.barcode,
      {
        listing_id: row.id,
        material_label: row.materials
          ? `${row.materials.code} — ${row.materials.name}`
          : "—",
      },
    ]),
  );

  const rows: RemoteRow[] = cachedRows.map((r) => ({
    barcode: r.barcode,
    title: r.title ?? "",
    stockCode: r.stock_code,
    salePrice: Number(r.sale_price ?? 0),
    listPrice: Number(r.list_price ?? 0),
    quantity: Number(r.quantity ?? 0),
    approved: r.approved ?? false,
    onSale: r.on_sale ?? false,
    imageUrl: r.image_url,
    mapped: mappedByBarcode.get(r.barcode) ?? null,
  }));

  const lastFetched = cachedRows.reduce<string | null>(
    (max, r) => (max === null || r.fetched_at > max ? r.fetched_at : max),
    null,
  );

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          <Link
            href={companyModulePath(companyId, "marketplace")}
            className="hover:underline"
          >
            ← Pazaryeri
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Trendyol&apos;dan Listeleri Çek
        </h1>
        <p className="text-sm text-muted-foreground">
          Trendyol mağazanızdaki ürünler (görselleriyle) burada kayıtlı kalır.
          Her birini ERP&apos;deki bitmiş ürünle eşleştirin; normal fiyat
          Trendyol&apos;daki güncel fiyattan alınır, sonra ERP&apos;den yönetilir.
        </p>
      </header>

      <CatalogRefresher
        companyId={companyId}
        lastFetched={lastFetched}
        count={rows.length}
      />

      <ImportMapper companyId={companyId} rows={rows} materials={materials ?? []} />
    </div>
  );
}
