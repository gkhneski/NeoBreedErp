import Link from "next/link";
import { redirect } from "next/navigation";

import { requireCompanyRole } from "@/lib/auth";
import { getAdapter } from "@/lib/marketplaces/adapters";
import { getMarketplaceConnection } from "@/lib/marketplaces/connections";
import { MarketplaceError, type RemoteListing } from "@/lib/marketplaces/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { ImportMapper } from "./import-mapper";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function MarketplaceImportPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    MASTER_DATA_WRITE_ROLES,
  );

  const connection = await getMarketplaceConnection(companyId, "trendyol");
  if (!connection) {
    redirect(companyModulePath(companyId, "settings", "marketplaces"));
  }

  let remoteListings: RemoteListing[] = [];
  let fetchError: string | null = null;
  try {
    remoteListings = await getAdapter("trendyol").fetchListings(connection);
  } catch (error) {
    fetchError =
      error instanceof MarketplaceError
        ? error.message
        : "Trendyol kataloğu alınırken beklenmeyen bir hata oluştu.";
  }

  const supabase = await createServerSupabaseClient();
  const [{ data: existing }, { data: materials }] = await Promise.all([
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
      .is("deleted_at", null)
      .order("code"),
  ]);

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

  const rows = remoteListings.map((remote) => ({
    ...remote,
    mapped: mappedByBarcode.get(remote.barcode) ?? null,
  }));

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
          Trendyol mağazanızdaki ürünler aşağıda. Her birini ERP&apos;deki
          bitmiş ürünle eşleştirin; normal fiyat Trendyol&apos;daki güncel
          fiyattan alınır, sonra ERP&apos;den yönetilir.
        </p>
      </header>

      {fetchError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {fetchError}
        </p>
      ) : (
        <ImportMapper
          companyId={companyId}
          rows={rows}
          materials={materials ?? []}
        />
      )}
    </div>
  );
}
