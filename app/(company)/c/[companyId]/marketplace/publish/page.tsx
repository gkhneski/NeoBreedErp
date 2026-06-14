import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { requireModuleAccess } from "@/lib/auth";
import { getMarketplaceConnection } from "@/lib/marketplaces/connections";
import { getCategoryAttributes } from "@/lib/marketplaces/trendyol";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

import { PublishForm } from "./publish-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

// Scoped to the seller's real setup (supplement category). Category attribute
// values are fetched live from Trendyol so the dropdowns are always valid.
const DEFAULT_CATEGORY_ID = 2325; // Bitkisel Ürünler
const DEFAULT_BRAND = "Saw River";

export default async function PublishPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireModuleAccess(routeCompanyId, "marketplace");
  const supabase = await createServerSupabaseClient();

  const backHref = companyModulePath(companyId, "marketplace");

  const connection = await getMarketplaceConnection(companyId, "trendyol");
  if (!connection) {
    return (
      <div className="space-y-6">
        <Header backHref={backHref} />
        <EmptyState
          title="Trendyol bağlantısı yok"
          description="Önce Ayarlar → Pazaryeri Bağlantıları'ndan Trendyol API bilgilerini girin."
        />
      </div>
    );
  }

  // Finished products not yet listed on Trendyol.
  const [{ data: listed }, { data: products }] = await Promise.all([
    supabase
      .from("marketplace_listings")
      .select("material_id")
      .eq("company_id", companyId)
      .eq("channel", "trendyol")
      .is("deleted_at", null),
    supabase
      .from("materials")
      .select("id, code, name, barcode")
      .eq("company_id", companyId)
      .eq("type", "finished")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const listedIds = new Set((listed ?? []).map((l) => l.material_id));
  const candidates = (products ?? []).filter((p) => !listedIds.has(p.id));

  let formValues: Array<{ id: number; name: string }> = [];
  let aromaValues: Array<{ id: number; name: string }> = [];
  let attrError: string | null = null;
  try {
    const attrs = await getCategoryAttributes(connection, DEFAULT_CATEGORY_ID);
    formValues = attrs.find((a) => a.attributeId === 40)?.values ?? [];
    aromaValues = attrs.find((a) => a.attributeId === 72)?.values ?? [];
  } catch {
    attrError =
      "Trendyol kategori bilgileri alınamadı. Bağlantı bilgilerini kontrol edin.";
  }

  return (
    <div className="space-y-6">
      <Header backHref={backHref} />

      {candidates.length === 0 ? (
        <EmptyState
          title="Yayınlanacak ürün yok"
          description="Tüm bitmiş ürünler ya zaten Trendyol'da eşli ya da henüz ürün eklenmemiş. Önce Ürünler'den bir bitmiş ürün ekleyin."
        />
      ) : attrError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {attrError}
        </p>
      ) : (
        <PublishForm
          companyId={companyId}
          products={candidates}
          categoryId={DEFAULT_CATEGORY_ID}
          defaultBrand={DEFAULT_BRAND}
          formValues={formValues}
          aromaValues={aromaValues}
        />
      )}
    </div>
  );
}

function Header({ backHref }: { backHref: string }) {
  return (
    <header className="space-y-1">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        <Link href={backHref} className="hover:underline">
          ← Pazaryeri
        </Link>
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">
        Trendyol&apos;a Ürün Yayınla
      </h1>
      <p className="text-sm text-muted-foreground">
        ERP&apos;deki bitmiş ürünü Trendyol&apos;da yeni ilan olarak oluşturur.
        Trendyol içerik onayından sonra yayına girer; fiyat/stok/SKT indirimi
        sonra otomatik yönetilir.
      </p>
    </header>
  );
}
