import "server-only";

import type { SiteFaqItem } from "@/types/database";

import { createPublicSupabaseClient } from "@/lib/supabase/server";

import { resolveSiteCompany } from "./config";

export type PublicProductPage = {
  slug: string;
  material_id: string;
  seo_title: string;
  seo_description: string;
  bullets: string[];
  keywords: string[];
  og_image_url: string | null;
  price_snapshot: number | null;
  barcode_snapshot: string | null;
  published_at: string | null;
};

export type PublicArticle = {
  slug: string;
  title: string;
  excerpt: string | null;
  body_md: string;
  keywords: string[];
  faq: SiteFaqItem[];
  cover_image_url: string | null;
  related_material_ids: string[];
  published_at: string | null;
};

const PRODUCT_COLS =
  "slug, material_id, seo_title, seo_description, bullets, keywords, og_image_url, price_snapshot, barcode_snapshot, published_at";
const ARTICLE_COLS =
  "slug, title, excerpt, body_md, keywords, faq, cover_image_url, related_material_ids, published_at";

export async function getPublishedProductPages(): Promise<PublicProductPage[]> {
  const companyId = resolveSiteCompany();
  if (!companyId) return [];
  const supabase = createPublicSupabaseClient();
  const { data } = await supabase
    .from("site_product_pages")
    .select(PRODUCT_COLS)
    .eq("company_id", companyId)
    .eq("status", "published")
    .is("deleted_at", null)
    .order("published_at", { ascending: false })
    .returns<PublicProductPage[]>();
  return data ?? [];
}

export async function getProductPageBySlug(
  slug: string,
): Promise<PublicProductPage | null> {
  const companyId = resolveSiteCompany();
  if (!companyId) return null;
  const supabase = createPublicSupabaseClient();
  const { data } = await supabase
    .from("site_product_pages")
    .select(PRODUCT_COLS)
    .eq("company_id", companyId)
    .eq("slug", slug)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle<PublicProductPage>();
  return data ?? null;
}

export async function getPublishedArticles(): Promise<PublicArticle[]> {
  const companyId = resolveSiteCompany();
  if (!companyId) return [];
  const supabase = createPublicSupabaseClient();
  const { data } = await supabase
    .from("site_articles")
    .select(ARTICLE_COLS)
    .eq("company_id", companyId)
    .eq("status", "published")
    .is("deleted_at", null)
    .order("published_at", { ascending: false })
    .returns<PublicArticle[]>();
  return data ?? [];
}

export async function getArticleBySlug(
  slug: string,
): Promise<PublicArticle | null> {
  const companyId = resolveSiteCompany();
  if (!companyId) return null;
  const supabase = createPublicSupabaseClient();
  const { data } = await supabase
    .from("site_articles")
    .select(ARTICLE_COLS)
    .eq("company_id", companyId)
    .eq("slug", slug)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle<PublicArticle>();
  return data ?? null;
}

// Resolve published product pages for a set of material ids (article → product links).
export async function getProductPagesByMaterialIds(
  materialIds: string[],
): Promise<PublicProductPage[]> {
  const companyId = resolveSiteCompany();
  if (!companyId || materialIds.length === 0) return [];
  const supabase = createPublicSupabaseClient();
  const { data } = await supabase
    .from("site_product_pages")
    .select(PRODUCT_COLS)
    .eq("company_id", companyId)
    .eq("status", "published")
    .is("deleted_at", null)
    .in("material_id", materialIds)
    .returns<PublicProductPage[]>();
  return data ?? [];
}
