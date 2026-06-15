"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { getAdapter } from "@/lib/marketplaces/adapters";
import { getMarketplaceConnection } from "@/lib/marketplaces/connections";
import { MarketplaceError } from "@/lib/marketplaces/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MARKETPLACE_WRITE_ROLES, companyModulePath } from "@/types/roles";

export type RefreshResult =
  | { ok: true; count: number; fetchedAt: string }
  | { ok: false; error: string };

// Pulls the live Trendyol catalog and persists a snapshot (with image) so the
// import screen shows it instantly and can auto-refresh on a timer.
export async function refreshRemoteCatalog(
  companyIdInput: string,
): Promise<RefreshResult> {
  const parsed = z.string().uuid().safeParse(companyIdInput);
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const { companyId } = await requireCompanyRole(
    parsed.data,
    MARKETPLACE_WRITE_ROLES,
  );

  const connection = await getMarketplaceConnection(companyId, "trendyol");
  if (!connection) {
    return { ok: false, error: "Trendyol bağlantısı yok veya devre dışı." };
  }

  let listings;
  try {
    listings = await getAdapter("trendyol").fetchListings(connection);
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof MarketplaceError
          ? error.message
          : "Trendyol kataloğu alınırken beklenmeyen bir hata oluştu.",
    };
  }

  const fetchedAt = new Date().toISOString();
  const supabase = await createServerSupabaseClient();

  if (listings.length > 0) {
    const { error: upErr } = await supabase
      .from("marketplace_remote_products")
      .upsert(
        listings.map((l) => ({
          company_id: companyId,
          channel: "trendyol" as const,
          barcode: l.barcode,
          title: l.title || null,
          image_url: l.imageUrl,
          stock_code: l.stockCode,
          sale_price: l.salePrice,
          list_price: l.listPrice,
          quantity: l.quantity,
          approved: l.approved,
          on_sale: l.onSale,
          fetched_at: fetchedAt,
        })),
        { onConflict: "company_id,channel,barcode" },
      );
    if (upErr) return { ok: false, error: upErr.message };
  }

  // Drop products that are no longer in the store (not touched this run).
  await supabase
    .from("marketplace_remote_products")
    .delete()
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .lt("fetched_at", fetchedAt);

  revalidatePath(companyModulePath(companyId, "marketplace", "import"));
  return { ok: true, count: listings.length, fetchedAt };
}
