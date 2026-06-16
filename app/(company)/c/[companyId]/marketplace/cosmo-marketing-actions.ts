"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { daysUntil } from "@/lib/expiry";
import {
  cosmoKeyConfigured,
  generateMarketingReports,
  researchCompetitors,
  type CompetitorResearch,
  type MarketingInput,
  type MarketingReport,
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
  material_id: string;
  materials: { name: string } | null;
};

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
      "id, barcode, title, normal_sale_price, normal_list_price, material_id, " +
        "materials:material_id(name)",
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
    salePrice: Number(r.normal_sale_price),
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
      "id, barcode, title, normal_sale_price, normal_list_price, material_id, " +
        "materials:material_id(name)",
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
    salePrice: Number(listing.normal_sale_price),
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
