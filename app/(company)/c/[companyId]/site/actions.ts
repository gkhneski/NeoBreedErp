"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import {
  cosmoKeyConfigured,
  generateArticle,
  generateMarketingReports,
  type MarketingInput,
} from "@/lib/marketplaces/cosmo-marketing";
import { SITE_BRAND_NAME, slugify } from "@/lib/site/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SiteFaqItem } from "@/types/database";
import { MASTER_DATA_WRITE_ROLES, companyModulePath } from "@/types/roles";

type Supa = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type DraftResult = { ok: true; id: string } | { ok: false; error: string };
export type SiteActionResult = { ok: true } | { ok: false; error: string };

const SITE_MODULE = "site";

// Revalidate the admin module + the public routes that show this content.
function revalidateProduct(companyId: string, slug?: string) {
  revalidatePath(companyModulePath(companyId, SITE_MODULE));
  revalidatePath("/");
  revalidatePath("/urunler");
  if (slug) revalidatePath(`/urun/${slug}`);
}
function revalidateArticle(companyId: string, slug?: string) {
  revalidatePath(companyModulePath(companyId, SITE_MODULE));
  revalidatePath("/");
  revalidatePath("/rehber");
  if (slug) revalidatePath(`/rehber/${slug}`);
}

async function uniqueSlug(
  supabase: Supa,
  table: "site_product_pages" | "site_articles",
  companyId: string,
  base: string,
  excludeId?: string,
): Promise<string> {
  const root = slugify(base) || "icerik";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    let q = supabase
      .from(table)
      .select("id")
      .eq("company_id", companyId)
      .eq("slug", candidate)
      .is("deleted_at", null);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q.maybeSingle();
    if (!data) return candidate;
  }
  return `${root}-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Product page draft — COSMO writes SEO title/description/bullets/keywords from
// our real numbers; we snapshot price + image so the public page is deterministic.
// ---------------------------------------------------------------------------

export async function generateProductPageDraft(
  companyIdInput: string,
  materialIdInput: string,
): Promise<DraftResult> {
  const parsed = z
    .object({ company: z.string().uuid(), material: z.string().uuid() })
    .safeParse({ company: companyIdInput, material: materialIdInput });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: material } = await supabase
    .from("materials")
    .select("id, name, barcode")
    .eq("id", parsed.data.material)
    .eq("company_id", companyId)
    .eq("type", "finished")
    .is("deleted_at", null)
    .maybeSingle<{ id: string; name: string; barcode: string | null }>();
  if (!material) return { ok: false, error: "Ürün bulunamadı." };

  const { data: listing } = await supabase
    .from("marketplace_listings")
    .select("title, normal_sale_price, normal_list_price, applied_sale_price")
    .eq("company_id", companyId)
    .eq("material_id", material.id)
    .eq("channel", "trendyol")
    .is("deleted_at", null)
    .maybeSingle<{
      title: string | null;
      normal_sale_price: number;
      normal_list_price: number | null;
      applied_sale_price: number | null;
    }>();

  let imageUrl: string | null = null;
  if (material.barcode) {
    const { data: remote } = await supabase
      .from("marketplace_remote_products")
      .select("image_url")
      .eq("company_id", companyId)
      .eq("channel", "trendyol")
      .eq("barcode", material.barcode)
      .maybeSingle<{ image_url: string | null }>();
    imageUrl = remote?.image_url ?? null;
  }

  let stockUnits = 0;
  const { data: lots } = await supabase
    .from("material_lots")
    .select("quantity_on_hand")
    .eq("company_id", companyId)
    .eq("material_id", material.id)
    .eq("status", "released")
    .is("owner_customer_id", null)
    .is("deleted_at", null)
    .gt("quantity_on_hand", 0);
  for (const l of lots ?? []) stockUnits += Number(l.quantity_on_hand);

  const price =
    listing?.applied_sale_price ?? listing?.normal_sale_price ?? null;

  const input: MarketingInput = {
    barcode: material.barcode ?? material.id,
    productName: material.name,
    currentTitle: listing?.title ?? null,
    salePrice: price !== null ? Number(price) : 0,
    listPrice: listing?.normal_list_price ?? null,
    stockUnits,
    daysToExpiry: null,
    unitsSold30d: 0,
    hasImage: Boolean(imageUrl),
  };

  const reports = await generateMarketingReports([input]);
  const report = reports.get(input.barcode)!;

  const { data: existing } = await supabase
    .from("site_product_pages")
    .select("id, slug")
    .eq("company_id", companyId)
    .eq("material_id", material.id)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; slug: string }>();

  const payload = {
    seo_title: report.title || material.name,
    seo_description: report.description,
    bullets: report.bullets,
    keywords: report.keywords,
    og_image_url: imageUrl,
    price_snapshot: price !== null ? Number(price) : null,
    barcode_snapshot: material.barcode,
    updated_by: ctx.userId,
  };

  if (existing) {
    const { error } = await supabase
      .from("site_product_pages")
      .update(payload)
      .eq("id", existing.id)
      .eq("company_id", companyId);
    if (error) return { ok: false, error: error.message };
    revalidateProduct(companyId, existing.slug);
    return { ok: true, id: existing.id };
  }

  const slug = await uniqueSlug(supabase, "site_product_pages", companyId, material.name);
  const { data: inserted, error } = await supabase
    .from("site_product_pages")
    .insert({
      company_id: companyId,
      material_id: material.id,
      slug,
      status: "draft",
      created_by: ctx.userId,
      ...payload,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "Taslak oluşturulamadı." };
  }
  revalidateProduct(companyId);
  return { ok: true, id: inserted.id };
}

// ---------------------------------------------------------------------------
// Article draft — COSMO writes a long-tail guide; we map related product names
// back to material ids for internal linking.
// ---------------------------------------------------------------------------

export async function generateArticleDraft(
  companyIdInput: string,
  topicInput: string,
): Promise<DraftResult> {
  const parsed = z
    .object({ company: z.string().uuid(), topic: z.string().min(3).max(160) })
    .safeParse({ company: companyIdInput, topic: topicInput });
  if (!parsed.success) {
    return { ok: false, error: "Geçerli bir konu/anahtar kelime girin." };
  }
  if (!cosmoKeyConfigured()) {
    return {
      ok: false,
      error: "Makale üretimi için ANTHROPIC_API_KEY gerekli (içerik Claude ile yazılır).",
    };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: products } = await supabase
    .from("materials")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("type", "finished")
    .is("deleted_at", null)
    .returns<Array<{ id: string; name: string }>>();
  const productList = products ?? [];

  let draft;
  try {
    draft = await generateArticle({
      topic: parsed.data.topic,
      brand: SITE_BRAND_NAME,
      productNames: productList.map((p) => p.name),
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Makale üretilemedi.",
    };
  }

  // Map returned product names → material ids (case-insensitive contains).
  const relatedIds = productList
    .filter((p) =>
      draft.relatedProductNames.some(
        (n) =>
          n.toLowerCase().includes(p.name.toLowerCase()) ||
          p.name.toLowerCase().includes(n.toLowerCase()),
      ),
    )
    .map((p) => p.id);

  const slug = await uniqueSlug(supabase, "site_articles", companyId, draft.title);
  const { data: inserted, error } = await supabase
    .from("site_articles")
    .insert({
      company_id: companyId,
      slug,
      title: draft.title,
      excerpt: draft.excerpt || null,
      body_md: draft.bodyMd,
      keywords: draft.keywords,
      faq: draft.faq as SiteFaqItem[],
      related_material_ids: relatedIds,
      status: "draft",
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "Makale oluşturulamadı." };
  }
  revalidateArticle(companyId);
  return { ok: true, id: inserted.id };
}

// ---------------------------------------------------------------------------
// Publish / unpublish / delete
// ---------------------------------------------------------------------------

const idSchema = z.object({ company: z.string().uuid(), id: z.string().uuid() });

export async function setProductPageStatus(
  companyIdInput: string,
  idInput: string,
  publish: boolean,
): Promise<SiteActionResult> {
  const parsed = idSchema.safeParse({ company: companyIdInput, id: idInput });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };
  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("site_product_pages")
    .update({
      status: publish ? "published" : "draft",
      published_at: publish ? new Date().toISOString() : null,
      updated_by: ctx.userId,
    })
    .eq("id", parsed.data.id)
    .eq("company_id", companyId)
    .select("slug")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Bulunamadı." };
  revalidateProduct(companyId, data.slug);
  return { ok: true };
}

export async function setArticleStatus(
  companyIdInput: string,
  idInput: string,
  publish: boolean,
): Promise<SiteActionResult> {
  const parsed = idSchema.safeParse({ company: companyIdInput, id: idInput });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };
  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("site_articles")
    .update({
      status: publish ? "published" : "draft",
      published_at: publish ? new Date().toISOString() : null,
      updated_by: ctx.userId,
    })
    .eq("id", parsed.data.id)
    .eq("company_id", companyId)
    .select("slug")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Bulunamadı." };
  revalidateArticle(companyId, data.slug);
  return { ok: true };
}

export async function deleteProductPage(
  companyIdInput: string,
  idInput: string,
): Promise<SiteActionResult> {
  const parsed = idSchema.safeParse({ company: companyIdInput, id: idInput });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };
  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("site_product_pages")
    .update({ deleted_at: new Date().toISOString(), status: "draft", updated_by: ctx.userId })
    .eq("id", parsed.data.id)
    .eq("company_id", companyId)
    .select("slug")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidateProduct(companyId, data?.slug);
  return { ok: true };
}

export async function deleteArticle(
  companyIdInput: string,
  idInput: string,
): Promise<SiteActionResult> {
  const parsed = idSchema.safeParse({ company: companyIdInput, id: idInput });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };
  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("site_articles")
    .update({ deleted_at: new Date().toISOString(), status: "draft", updated_by: ctx.userId })
    .eq("id", parsed.data.id)
    .eq("company_id", companyId)
    .select("slug")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidateArticle(companyId, data?.slug);
  return { ok: true };
}
