"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { daysUntil } from "@/lib/expiry";
import { getAdapter } from "@/lib/marketplaces/adapters";
import { getMarketplaceConnection } from "@/lib/marketplaces/connections";
import {
  buildContentUpdateItem,
  getRawProductByBarcode,
  updateProductContent,
} from "@/lib/marketplaces/trendyol";
import { MarketplaceError } from "@/lib/marketplaces/types";
import {
  analyzeVisibility,
  cosmoKeyConfigured,
  generateMarketingReports,
  researchCompetitors,
  type CompetitorResearch,
  type MarketingInput,
  type MarketingReport,
  type VisibilityReport,
} from "@/lib/marketplaces/cosmo-marketing";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import {
  MARKETPLACE_APPROVE_ROLES,
  MARKETPLACE_WRITE_ROLES,
  companyModulePath,
} from "@/types/roles";

export type CosmoMarketingProduct = {
  listingId: string;
  barcode: string;
  productName: string;
  currentTitle: string | null;
  imageUrl: string | null;
  salePrice: number;
  listPrice: number | null;
  stockUnits: number;
  daysToExpiry: number | null;
  unitsSold30d: number;
  report: MarketingReport;
};

export type CosmoMarketingResult =
  | { ok: true; products: CosmoMarketingProduct[]; aiPowered: boolean }
  | { ok: false; error: string };

type ListingRow = {
  id: string;
  barcode: string;
  title: string | null;
  normal_sale_price: number;
  normal_list_price: number | null;
  applied_sale_price: number | null;
  material_id: string;
  materials: { name: string } | null;
};

// Pazaryerinde şu an canlı olan fiyat: onaylanıp uygulanan indirim/fiyat varsa o,
// yoksa normal (baz) satış fiyatı. COSMO "mevcut fiyat"ı buradan okumalı.
function effectiveSalePrice(r: {
  normal_sale_price: number;
  applied_sale_price: number | null;
}): number {
  return r.applied_sale_price !== null
    ? Number(r.applied_sale_price)
    : Number(r.normal_sale_price);
}

// COSMO marketing scan: per-product pricing, content, strategy, audit & competitor
// read — grounded on our real numbers (price, stock, SKT, last-30-day sales).
export async function cosmoMarketingScan(
  companyIdInput: string,
): Promise<CosmoMarketingResult> {
  if (!z.string().uuid().safeParse(companyIdInput).success) {
    return { ok: false, error: "Geçersiz istek." };
  }
  const { companyId } = await requireCompanyRole(
    companyIdInput,
    MARKETPLACE_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: listings } = await supabase
    .from("marketplace_listings")
    .select(
      "id, barcode, title, normal_sale_price, normal_list_price, applied_sale_price, " +
        "material_id, materials:material_id(name)",
    )
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .returns<ListingRow[]>();

  const rows = listings ?? [];
  if (rows.length === 0) {
    return { ok: true, products: [], aiPowered: cosmoKeyConfigured() };
  }

  const materialIds = Array.from(new Set(rows.map((r) => r.material_id)));
  const barcodes = Array.from(new Set(rows.map((r) => r.barcode)));

  // Stock + nearest expiry per material (released, sellable).
  const stockByMaterial = new Map<string, number>();
  const expiryByMaterial = new Map<string, string>();
  const { data: lots } = await supabase
    .from("material_lots")
    .select("material_id, quantity_on_hand, expiry_date")
    .eq("company_id", companyId)
    .in("material_id", materialIds)
    .eq("status", "released")
    .is("owner_customer_id", null)
    .is("deleted_at", null)
    .gt("quantity_on_hand", 0);
  for (const lot of lots ?? []) {
    stockByMaterial.set(
      lot.material_id,
      (stockByMaterial.get(lot.material_id) ?? 0) + Number(lot.quantity_on_hand),
    );
    if (lot.expiry_date) {
      const cur = expiryByMaterial.get(lot.material_id);
      if (!cur || lot.expiry_date < cur)
        expiryByMaterial.set(lot.material_id, lot.expiry_date);
    }
  }

  // Catalog image presence by barcode.
  const imageByBarcode = new Map<string, string | null>();
  const { data: remotes } = await supabase
    .from("marketplace_remote_products")
    .select("barcode, image_url")
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .in("barcode", barcodes);
  for (const r of remotes ?? []) imageByBarcode.set(r.barcode, r.image_url);

  // Sales velocity: units sold per barcode in the last 30 days (cached orders).
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const soldByBarcode = new Map<string, number>();
  const { data: orders } = await supabase
    .from("marketplace_orders")
    .select("lines, order_date")
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .gte("order_date", since.toISOString())
    .limit(1000);
  for (const o of orders ?? []) {
    const lines = (o.lines as Array<{ barcode?: string; quantity?: number }> | null) ?? [];
    for (const l of lines) {
      if (!l.barcode) continue;
      soldByBarcode.set(
        l.barcode,
        (soldByBarcode.get(l.barcode) ?? 0) + Number(l.quantity ?? 0),
      );
    }
  }

  const inputs: MarketingInput[] = rows.map((r) => ({
    barcode: r.barcode,
    productName: r.materials?.name ?? r.title ?? r.barcode,
    currentTitle: r.title,
    salePrice: effectiveSalePrice(r),
    listPrice:
      r.normal_list_price !== null ? Number(r.normal_list_price) : null,
    stockUnits: stockByMaterial.get(r.material_id) ?? 0,
    daysToExpiry: expiryByMaterial.has(r.material_id)
      ? daysUntil(expiryByMaterial.get(r.material_id)!)
      : null,
    unitsSold30d: soldByBarcode.get(r.barcode) ?? 0,
    hasImage: Boolean(imageByBarcode.get(r.barcode)),
  }));

  const reports = await generateMarketingReports(inputs);

  const products: CosmoMarketingProduct[] = rows.map((r) => {
    const input = inputs.find((i) => i.barcode === r.barcode)!;
    return {
      listingId: r.id,
      barcode: r.barcode,
      productName: input.productName,
      currentTitle: r.title,
      imageUrl: imageByBarcode.get(r.barcode) ?? null,
      salePrice: input.salePrice,
      listPrice: input.listPrice,
      stockUnits: input.stockUnits,
      daysToExpiry: input.daysToExpiry,
      unitsSold30d: input.unitsSold30d,
      report: reports.get(r.barcode)!,
    };
  });

  return { ok: true, products, aiPowered: cosmoKeyConfigured() };
}

export type CompetitorResult =
  | { ok: true; research: CompetitorResearch; listingId: string; aiPowered: boolean }
  | { ok: false; error: string };

// Live competitor research for ONE product via Claude web_search over Trendyol.
export async function cosmoCompetitorResearch(
  companyIdInput: string,
  listingIdInput: string,
): Promise<CompetitorResult> {
  const parsed = z
    .object({ company: z.string().uuid(), listing: z.string().uuid() })
    .safeParse({ company: companyIdInput, listing: listingIdInput });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  if (!cosmoKeyConfigured()) {
    return {
      ok: false,
      error:
        "Canlı rakip araştırması için ANTHROPIC_API_KEY gerekli (web arama Claude ile yapılır).",
    };
  }

  const { companyId } = await requireCompanyRole(
    parsed.data.company,
    MARKETPLACE_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: listing } = await supabase
    .from("marketplace_listings")
    .select(
      "id, barcode, title, normal_sale_price, normal_list_price, applied_sale_price, " +
        "material_id, materials:material_id(name)",
    )
    .eq("id", parsed.data.listing)
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .is("deleted_at", null)
    .maybeSingle<ListingRow>();
  if (!listing) return { ok: false, error: "Listing bulunamadı." };

  // Stock + nearest expiry for context.
  let stockUnits = 0;
  let nearestExpiry: string | null = null;
  const { data: lots } = await supabase
    .from("material_lots")
    .select("quantity_on_hand, expiry_date")
    .eq("company_id", companyId)
    .eq("material_id", listing.material_id)
    .eq("status", "released")
    .is("owner_customer_id", null)
    .is("deleted_at", null)
    .gt("quantity_on_hand", 0);
  for (const lot of lots ?? []) {
    stockUnits += Number(lot.quantity_on_hand);
    if (lot.expiry_date && (!nearestExpiry || lot.expiry_date < nearestExpiry))
      nearestExpiry = lot.expiry_date;
  }

  const input: MarketingInput = {
    barcode: listing.barcode,
    productName: listing.materials?.name ?? listing.title ?? listing.barcode,
    currentTitle: listing.title,
    salePrice: effectiveSalePrice(listing),
    listPrice:
      listing.normal_list_price !== null
        ? Number(listing.normal_list_price)
        : null,
    stockUnits,
    daysToExpiry: nearestExpiry ? daysUntil(nearestExpiry) : null,
    unitsSold30d: 0,
    hasImage: true,
  };

  try {
    const research = await Promise.race([
      researchCompetitors(input),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 160_000),
      ),
    ]);
    return { ok: true, research, listingId: listing.id, aiPowered: true };
  } catch (e) {
    const timedOut = e instanceof Error && e.message === "timeout";
    return {
      ok: false,
      error: timedOut
        ? "Araştırma çok uzun sürdü ve durduruldu. Tekrar deneyin."
        : "Canlı arama başarısız oldu. Birkaç saniye sonra tekrar deneyin.",
    };
  }
}

export type VisibilityCheck = { label: string; ok: boolean; detail: string };
export type CosmoVisibilityResult =
  | { ok: true; report: VisibilityReport; checks: VisibilityCheck[] }
  | { ok: false; error: string };

// "Aramada neden çıkmıyorum": bizim satıcı verimizden kesin teşhis (checks) +
// Claude'un canlı Trendyol aramasıyla strateji (report).
export async function cosmoVisibility(
  companyIdInput: string,
  listingIdInput: string,
): Promise<CosmoVisibilityResult> {
  const parsed = z
    .object({ company: z.string().uuid(), listing: z.string().uuid() })
    .safeParse({ company: companyIdInput, listing: listingIdInput });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  if (!cosmoKeyConfigured()) {
    return {
      ok: false,
      error: "Görünürlük analizi için ANTHROPIC_API_KEY gerekli (canlı arama Claude ile yapılır).",
    };
  }

  const { companyId } = await requireCompanyRole(
    parsed.data.company,
    MARKETPLACE_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: listing } = await supabase
    .from("marketplace_listings")
    .select(
      "id, barcode, title, normal_sale_price, applied_sale_price, " +
        "material_id, materials:material_id(name)",
    )
    .eq("id", parsed.data.listing)
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .is("deleted_at", null)
    .maybeSingle<ListingRow>();
  if (!listing) return { ok: false, error: "Listing bulunamadı." };

  // Trendyol katalog durumu (onaylı/satışta/stok/görsel) — bizim çektiğimiz cache.
  const { data: remote } = await supabase
    .from("marketplace_remote_products")
    .select("approved, on_sale, quantity, image_url")
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .eq("barcode", listing.barcode)
    .maybeSingle();

  // Bizim satılabilir stok.
  let stockUnits = 0;
  const { data: lots } = await supabase
    .from("material_lots")
    .select("quantity_on_hand")
    .eq("company_id", companyId)
    .eq("material_id", listing.material_id)
    .eq("status", "released")
    .is("owner_customer_id", null)
    .is("deleted_at", null)
    .gt("quantity_on_hand", 0);
  for (const l of lots ?? []) stockUnits += Number(l.quantity_on_hand);

  // Son 30 gün satış (cache'li siparişlerden).
  const since = new Date();
  since.setDate(since.getDate() - 30);
  let sold30d = 0;
  const { data: orders } = await supabase
    .from("marketplace_orders")
    .select("lines, order_date")
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .gte("order_date", since.toISOString())
    .limit(1000);
  for (const o of orders ?? []) {
    const lines = (o.lines as Array<{ barcode?: string; quantity?: number }> | null) ?? [];
    for (const l of lines) {
      if (l.barcode === listing.barcode) sold30d += Number(l.quantity ?? 0);
    }
  }

  const title = listing.title ?? "";
  const hasImage = Boolean(remote?.image_url);
  const approved = remote?.approved ?? null;
  const onSale = remote?.on_sale ?? null;

  const checks: VisibilityCheck[] = [
    {
      label: "Trendyol'da onaylı",
      ok: approved === true,
      detail:
        approved === true
          ? "Ürün onaylı."
          : approved === false
            ? "Ürün ONAYSIZ — onaysız ürün aramada hiç çıkmaz."
            : "Trendyol kataloğunda bulunamadı; önce 'Listeleri Çek' ile eşleştirin.",
    },
    {
      label: "Satışta ve stok var",
      ok: onSale !== false && stockUnits > 0,
      detail:
        stockUnits > 0
          ? onSale === false
            ? "Trendyol'da satışta görünmüyor."
            : `Satılabilir stok: ${stockUnits.toLocaleString("tr-TR")}.`
          : "Satılabilir stok 0 — stoğu biten ürün aramada düşer.",
    },
    {
      label: "Başlık arama için yeterli",
      ok: title.length >= 30,
      detail:
        title.length >= 30
          ? "Başlık makul uzunlukta."
          : "Başlık kısa/zayıf — marka + ürün + form + mg + adet içermeli.",
    },
    {
      label: "Ürün görseli var",
      ok: hasImage,
      detail: hasImage ? "Görsel mevcut." : "Görsel eksik — tıklanmayı ve sırayı düşürür.",
    },
    {
      label: "Satış ivmesi (son 30 gün)",
      ok: sold30d > 0,
      detail:
        sold30d > 0
          ? `${sold30d} adet satış var.`
          : "Son 30 günde satış yok — sıralamanın en belirleyici eksiği bu (cold start).",
    },
  ];

  try {
    const report = await analyzeVisibility({
      productName: listing.materials?.name ?? (title || listing.barcode),
      currentTitle: listing.title,
      salePrice: effectiveSalePrice(listing),
      approved,
      onSale,
      stockUnits,
      unitsSold30d: sold30d,
      hasImage,
    });
    return { ok: true, report, checks };
  } catch {
    return { ok: false, error: "Canlı analiz başarısız oldu. Tekrar deneyin." };
  }
}

export type ProposeResult = { ok: true } | { ok: false; error: string };

const proposeSchema = z.object({
  company: z.string().uuid(),
  listing: z.string().uuid(),
  salePrice: z.number().positive(),
});

// "Öner, ben onaylayım": COSMO'nun fiyat önerisini bekleyen onay kuyruğuna ekler.
// Mevcut approvePriceEvent zinciri onayda Trendyol'a gönderir.
export async function proposeMarketingPrice(
  companyIdInput: string,
  listingIdInput: string,
  salePriceInput: number,
): Promise<ProposeResult> {
  const parsed = proposeSchema.safeParse({
    company: companyIdInput,
    listing: listingIdInput,
    salePrice: salePriceInput,
  });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company,
    MARKETPLACE_APPROVE_ROLES,
  );

  const supabase = await createServerSupabaseClient();
  const { data: listing } = await supabase
    .from("marketplace_listings")
    .select("id")
    .eq("id", parsed.data.listing)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!listing) return { ok: false, error: "Listing bulunamadı." };

  const service = createServiceRoleClient();
  const { error } = await service.from("marketplace_price_events").insert({
    company_id: companyId,
    listing_id: listing.id,
    kind: "manual",
    old_price: null,
    new_price: parsed.data.salePrice,
    created_by: ctx.userId,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error:
          "Bu listing için bekleyen bir öneri zaten var. Önce Bekleyen Fiyat Onayları'ndan onu işleyin.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(companyModulePath(companyId, "marketplace"));
  revalidatePath(companyModulePath(companyId));
  return { ok: true };
}

// =============================================================================
// COSMO içerik (başlık/açıklama) → Trendyol. Fiyat gibi: onayla & gönder.
// =============================================================================

export type ContentPushResult =
  | { ok: true; batchRequestId: string }
  | { ok: false; error: string };
export type ContentStatusResult =
  | { ok: true; status: "pending" | "approved" | "failed"; error?: string }
  | { ok: false; error: string };

const contentSchema = z.object({
  company: z.string().uuid(),
  listing: z.string().uuid(),
  title: z.string().trim().min(5).max(100),
  description: z.string().trim().min(10).max(8000),
});

// COSMO'nun önerdiği başlık + açıklamayı mevcut Trendyol listingine gönderir.
// Ürünün kategori/marka/attribute/görselini Trendyol'dan çekip korur; yalnızca
// içerik değişir. Trendyol içeriği yeniden onaya alır; fiyat/stok'a dokunulmaz.
export async function pushListingContent(
  companyIdInput: string,
  listingIdInput: string,
  titleInput: string,
  descriptionInput: string,
): Promise<ContentPushResult> {
  const parsed = contentSchema.safeParse({
    company: companyIdInput,
    listing: listingIdInput,
    title: titleInput,
    description: descriptionInput,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Başlık/açıklama geçersiz.",
    };
  }

  const { companyId } = await requireCompanyRole(
    parsed.data.company,
    MARKETPLACE_APPROVE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: listing } = await supabase
    .from("marketplace_listings")
    .select("id, barcode, stock_code")
    .eq("id", parsed.data.listing)
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .is("deleted_at", null)
    .maybeSingle<{ id: string; barcode: string; stock_code: string | null }>();
  if (!listing) return { ok: false, error: "Listing bulunamadı." };

  const connection = await getMarketplaceConnection(companyId, "trendyol");
  if (!connection) {
    return { ok: false, error: "Trendyol bağlantısı yok veya devre dışı." };
  }

  try {
    const raw = await getRawProductByBarcode(connection, listing.barcode);
    if (!raw) {
      return { ok: false, error: "Trendyol'da bu barkodla ürün bulunamadı." };
    }
    const item = buildContentUpdateItem(raw, {
      title: parsed.data.title,
      description: parsed.data.description,
      stockCodeFallback: listing.stock_code ?? listing.barcode,
    });
    const { batchRequestId } = await updateProductContent(connection, [item]);

    await supabase
      .from("marketplace_listings")
      .update({
        title: parsed.data.title,
        content_batch_id: batchRequestId,
        publish_status: "pending",
        publish_error: null,
      })
      .eq("id", listing.id)
      .eq("company_id", companyId);

    revalidatePath(companyModulePath(companyId, "marketplace"));
    return { ok: true, batchRequestId };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof MarketplaceError
          ? error.message
          : "Trendyol'a içerik gönderiminde beklenmeyen bir hata oluştu.",
    };
  }
}

// Gönderilen içeriğin Trendyol batch durumunu yoklar.
export async function refreshContentStatus(
  companyIdInput: string,
  listingIdInput: string,
): Promise<ContentStatusResult> {
  const parsed = z
    .object({ company: z.string().uuid(), listing: z.string().uuid() })
    .safeParse({ company: companyIdInput, listing: listingIdInput });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const { companyId } = await requireCompanyRole(
    parsed.data.company,
    MARKETPLACE_APPROVE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: listing } = await supabase
    .from("marketplace_listings")
    .select("id, content_batch_id")
    .eq("id", parsed.data.listing)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; content_batch_id: string | null }>();
  if (!listing?.content_batch_id) {
    return { ok: false, error: "Bu listing için gönderilmiş içerik yok." };
  }

  const connection = await getMarketplaceConnection(companyId, "trendyol");
  if (!connection) return { ok: false, error: "Trendyol bağlantısı yok." };

  try {
    const res = await getAdapter("trendyol").getBatchStatus(
      connection,
      listing.content_batch_id,
    );
    if (!res.complete) return { ok: true, status: "pending" };

    const item = res.items[0];
    const ok = item?.ok ?? false;
    await supabase
      .from("marketplace_listings")
      .update({
        publish_status: ok ? "approved" : "rejected",
        publish_error: ok ? null : item?.error ?? "Bilinmeyen hata",
      })
      .eq("id", listing.id)
      .eq("company_id", companyId);

    revalidatePath(companyModulePath(companyId, "marketplace"));
    return ok
      ? { ok: true, status: "approved" }
      : { ok: true, status: "failed", error: item?.error };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof MarketplaceError
          ? error.message
          : "Durum sorgulanamadı, tekrar deneyin.",
    };
  }
}
