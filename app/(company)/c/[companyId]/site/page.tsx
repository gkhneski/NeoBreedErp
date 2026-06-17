import { requireModuleAccess } from "@/lib/auth";
import { cosmoKeyConfigured } from "@/lib/marketplaces/cosmo-marketing";
import { SITE_BRAND_NAME, siteBaseUrl, siteIsIndexable } from "@/lib/site/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES, canWriteCompanyData } from "@/types/roles";

import { SiteManager, type ArticleRow, type ProductRow } from "./site-manager";

// COSMO content generation (article web-light) can run 30-90s.
export const maxDuration = 120;

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function SitePage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireModuleAccess(routeCompanyId, "site");
  const supabase = await createServerSupabaseClient();

  const [{ data: materials }, { data: pages }, { data: articles }] =
    await Promise.all([
      supabase
        .from("materials")
        .select("id, name, barcode")
        .eq("company_id", companyId)
        .eq("type", "finished")
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .returns<Array<{ id: string; name: string; barcode: string | null }>>(),
      supabase
        .from("site_product_pages")
        .select("id, material_id, slug, seo_title, status, price_snapshot")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .returns<
          Array<{
            id: string;
            material_id: string;
            slug: string;
            seo_title: string;
            status: "draft" | "published";
            price_snapshot: number | null;
          }>
        >(),
      supabase
        .from("site_articles")
        .select("id, slug, title, excerpt, status")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .returns<
          Array<{
            id: string;
            slug: string;
            title: string;
            excerpt: string | null;
            status: "draft" | "published";
          }>
        >(),
    ]);

  const pageByMaterial = new Map((pages ?? []).map((p) => [p.material_id, p]));
  const productRows: ProductRow[] = (materials ?? []).map((m) => {
    const page = pageByMaterial.get(m.id) ?? null;
    return {
      materialId: m.id,
      name: m.name,
      barcode: m.barcode,
      page: page
        ? {
            id: page.id,
            slug: page.slug,
            seoTitle: page.seo_title,
            status: page.status,
            price: page.price_snapshot,
          }
        : null,
    };
  });

  const articleRows: ArticleRow[] = (articles ?? []).map((a) => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    excerpt: a.excerpt,
    status: a.status,
  }));

  const canManage = canWriteCompanyData(role, MASTER_DATA_WRITE_ROLES);

  return (
    <SiteManager
      companyId={companyId}
      brand={SITE_BRAND_NAME}
      baseUrl={siteBaseUrl()}
      indexable={siteIsIndexable()}
      aiPowered={cosmoKeyConfigured()}
      canManage={canManage}
      products={productRows}
      articles={articleRows}
    />
  );
}
