import { EmptyState } from "@/components/ui/empty-state";
import { requireModuleAccess } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  MASTER_DATA_WRITE_ROLES,
  canWriteCompanyData,
} from "@/types/roles";

import { CatalogManager, type CatalogManagerRow } from "./catalog-manager";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type MaterialRow = {
  id: string;
  code: string;
  name: string;
  base_uom: string;
  product_catalog: Array<{
    is_listed: boolean;
    sale_price: number | null;
    low_stock_threshold: number;
    deleted_at: string | null;
  }> | null;
};

export default async function PortalCatalogAdminPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireModuleAccess(
    routeCompanyId,
    "portal-catalog",
  );
  const canWrite = canWriteCompanyData(role, MASTER_DATA_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("materials")
    .select(
      "id, code, name, base_uom, " +
        "product_catalog(is_listed, sale_price, low_stock_threshold, deleted_at)",
    )
    .eq("company_id", companyId)
    .eq("type", "finished")
    .is("deleted_at", null)
    .order("name")
    .returns<MaterialRow[]>();

  const rows: CatalogManagerRow[] = (data ?? []).map((m) => {
    const entry = (m.product_catalog ?? []).find((c) => c.deleted_at === null);
    return {
      materialId: m.id,
      code: m.code,
      name: m.name,
      baseUom: m.base_uom,
      isListed: entry?.is_listed ?? false,
      salePrice: entry?.sale_price === undefined || entry?.sale_price === null
        ? null
        : Number(entry.sale_price),
      lowStockThreshold: entry?.low_stock_threshold ?? 10,
    };
  });

  const listedCount = rows.filter((r) => r.isListed).length;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Portal Kataloğu</h1>
        <p className="text-sm text-muted-foreground">
          Eczane alıcılarının portalda göreceği ürünleri, B2B fiyatını ve düşük stok
          eşiğini buradan yönetin. {listedCount} ürün listede.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="Bitmiş ürün yok"
          description="Önce Ürünler'den bitmiş ürün tanımlayın; sonra burada portala açabilirsiniz."
        />
      ) : (
        <CatalogManager companyId={companyId} rows={rows} canWrite={canWrite} />
      )}
    </div>
  );
}
