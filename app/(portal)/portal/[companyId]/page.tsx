import { EmptyState } from "@/components/ui/empty-state";
import { requireBuyer } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CatalogAvailability } from "@/types/database";

import { CatalogClient, type CatalogProduct } from "./catalog-client";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function PortalCatalogPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireBuyer(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("buyer_catalog")
    .select("material_id, code, name, barcode, base_uom, sale_price, image_url, availability")
    .eq("company_id", companyId)
    .order("name");

  const products: CatalogProduct[] = (data ?? []).map((p) => ({
    materialId: p.material_id,
    code: p.code,
    name: p.name,
    baseUom: p.base_uom,
    salePrice: p.sale_price === null ? null : Number(p.sale_price),
    imageUrl: p.image_url,
    availability: p.availability as CatalogAvailability,
  }));

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Katalog</h1>
        <p className="text-sm text-muted-foreground">
          Ürünleri sepete ekleyip sipariş oluşturun. Ödeme alınmaz; siparişiniz
          depoya iletilir.
        </p>
      </div>

      {products.length === 0 ? (
        <EmptyState
          title="Katalog şu an boş"
          description="Tedarikçi henüz portala ürün eklememiş. Lütfen daha sonra tekrar bakın."
        />
      ) : (
        <CatalogClient companyId={companyId} products={products} />
      )}
    </div>
  );
}
