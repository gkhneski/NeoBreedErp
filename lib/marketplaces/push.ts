import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, MarketplaceChannel } from "@/types/database";

import { getAdapter } from "./adapters";
import { getMarketplaceConnection } from "./connections";
import { getSellableQuantity } from "./stock";
import { MarketplaceError } from "./types";

type ServiceClient = SupabaseClient<Database>;

export interface PushListingContext {
  id: string;
  channel: MarketplaceChannel;
  material_id: string;
  barcode: string;
  normal_sale_price: number;
  normal_list_price: number | null;
  sync_stock: boolean;
}

export type PushResult = { ok: true } | { ok: false; error: string };

// Onaylanan fiyat olayini pazaryerine gonderir. Durum makinesi:
// pending -> pushed (batch id ile) -> confirmed/failed (reconcile asamasinda).
export async function pushApprovedEvent(
  service: ServiceClient,
  eventId: string,
  companyId: string,
  listing: PushListingContext,
  newPrice: number,
  actorUserId: string,
): Promise<PushResult> {
  const now = new Date().toISOString();

  const failEvent = async (message: string): Promise<PushResult> => {
    await service
      .from("marketplace_price_events")
      .update({
        status: "failed",
        error: message,
        acted_at: now,
        acted_by: actorUserId,
      })
      .eq("id", eventId);
    await service
      .from("marketplace_listings")
      .update({ sync_status: "failed", sync_error: message })
      .eq("id", listing.id);
    return { ok: false, error: message };
  };

  const connection = await getMarketplaceConnection(companyId, listing.channel);
  if (!connection) {
    return failEvent(
      "Pazaryeri bağlantısı bulunamadı veya devre dışı. Ayarlar → Pazaryeri Bağlantıları'nı kontrol edin.",
    );
  }

  const quantity = listing.sync_stock
    ? await getSellableQuantity(service, companyId, listing.material_id)
    : undefined;

  const listPriceBase = listing.normal_list_price ?? listing.normal_sale_price;
  const item = {
    barcode: listing.barcode,
    salePrice: newPrice,
    listPrice: Math.max(listPriceBase, newPrice),
    ...(quantity !== undefined ? { quantity: Math.floor(quantity) } : {}),
  };

  let batchRequestId: string;
  try {
    const result = await getAdapter(listing.channel).pushPriceAndStock(
      connection,
      [item],
    );
    batchRequestId = result.batchRequestId;
  } catch (error) {
    const message =
      error instanceof MarketplaceError
        ? error.message
        : "Pazaryerine gönderim sırasında beklenmeyen bir hata oluştu.";
    return failEvent(message);
  }

  await service
    .from("marketplace_price_events")
    .update({
      status: "pushed",
      batch_request_id: batchRequestId,
      acted_at: now,
      acted_by: actorUserId,
    })
    .eq("id", eventId);
  await service
    .from("marketplace_listings")
    .update({
      sync_status: "pending",
      sync_error: null,
      last_batch_request_id: batchRequestId,
    })
    .eq("id", listing.id);

  return { ok: true };
}
