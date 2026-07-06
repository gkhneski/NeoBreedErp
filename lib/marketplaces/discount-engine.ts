import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, MarketplaceChannel } from "@/types/database";

import { getAdapter } from "./adapters";
import { getMarketplaceConnection } from "./connections";
import { MarketplaceError } from "./types";

type ServiceClient = SupabaseClient<Database>;

type DetectionListing = {
  id: string;
  company_id: string;
  channel: MarketplaceChannel;
  material_id: string;
  normal_sale_price: number;
  current_price_state: "normal" | "discounted" | "unknown";
  applied_sale_price: number | null;
};

type DiscountTier = { max_days_left: number; discount_percent: number };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Tiers sorted ascending by max_days_left. Returns the deepest applicable
// percent: the tightest band whose window still contains days_left.
function pickTierPercent(
  tiersAsc: DiscountTier[],
  daysLeft: number | undefined,
): number {
  if (daysLeft === undefined) return 0;
  for (const tier of tiersAsc) {
    if (daysLeft <= tier.max_days_left) return tier.discount_percent;
  }
  return 0;
}

export interface DetectionSummary {
  companiesChecked: number;
  discountProposals: number;
  restoreProposals: number;
  reconciledEvents: number;
}

function isoDate(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

async function insertProposal(
  service: ServiceClient,
  proposal: Database["public"]["Tables"]["marketplace_price_events"]["Insert"],
): Promise<boolean> {
  const { error } = await service
    .from("marketplace_price_events")
    .insert(proposal);
  if (!error) return true;
  if (error.code !== "23505") throw new Error(error.message);

  // 23505 = listing icin zaten bekleyen bir oneri var (marketplace_price_events_one_pending).
  // Onu sessizce yoksaymak, SKT gun sayisi/fiyat/indirim yuzdesini ilk hesaplandigi
  // gunde donduruyordu — gunler gectikce gercek deger degistigi halde oneri hic
  // tazelenmiyordu. Bunun yerine bekleyen satiri guncel degerlerle yeniliyoruz.
  const { error: updateError } = await service
    .from("marketplace_price_events")
    .update({
      kind: proposal.kind,
      old_price: proposal.old_price,
      new_price: proposal.new_price,
      trigger_expiry_date: proposal.trigger_expiry_date ?? null,
      trigger_days_left: proposal.trigger_days_left ?? null,
    })
    .eq("listing_id", proposal.listing_id)
    .eq("status", "pending");
  if (updateError) throw new Error(updateError.message);
  return true;
}

export async function reconcilePendingBatches(
  service: ServiceClient,
  companyId?: string,
): Promise<number> {
  let query = service
    .from("marketplace_price_events")
    .select(
      "id, company_id, kind, new_price, batch_request_id, " +
        "listing:listing_id(id, channel, normal_sale_price)",
    )
    .eq("status", "pushed")
    .not("batch_request_id", "is", null);
  if (companyId) query = query.eq("company_id", companyId);

  const { data: events } = await query.returns<
    Array<{
      id: string;
      company_id: string;
      kind: "discount" | "restore" | "manual";
      new_price: number;
      batch_request_id: string;
      listing: {
        id: string;
        channel: MarketplaceChannel;
        normal_sale_price: number;
      } | null;
    }>
  >();

  let reconciled = 0;
  for (const event of events ?? []) {
    if (!event.listing) continue;
    const connection = await getMarketplaceConnection(
      event.company_id,
      event.listing.channel,
    );
    if (!connection) continue;

    let result;
    try {
      result = await getAdapter(event.listing.channel).getBatchStatus(
        connection,
        event.batch_request_id,
      );
    } catch (error) {
      if (error instanceof MarketplaceError && error.retryable) continue;
      continue;
    }
    if (!result.complete) continue;

    const failures = result.items.filter((i) => !i.ok);
    const now = new Date().toISOString();

    if (failures.length === 0) {
      const priceState =
        event.kind === "restore"
          ? "normal"
          : event.kind === "discount"
            ? "discounted"
            : event.new_price < Number(event.listing.normal_sale_price)
              ? "discounted"
              : "normal";

      await service
        .from("marketplace_price_events")
        .update({ status: "confirmed" })
        .eq("id", event.id);
      await service
        .from("marketplace_listings")
        .update({
          current_price_state: priceState,
          applied_sale_price: event.new_price,
          sync_status: "ok",
          sync_error: null,
          last_synced_at: now,
        })
        .eq("id", event.listing.id);
    } else {
      const errorText = failures
        .map((f) => f.error ?? "Bilinmeyen hata")
        .join("; ");
      await service
        .from("marketplace_price_events")
        .update({ status: "failed", error: errorText })
        .eq("id", event.id);
      await service
        .from("marketplace_listings")
        .update({ sync_status: "failed", sync_error: errorText })
        .eq("id", event.listing.id);
    }
    reconciled += 1;
  }
  return reconciled;
}

export async function runDiscountDetection(
  service: ServiceClient,
  companyId?: string,
): Promise<DetectionSummary> {
  const reconciledEvents = await reconcilePendingBatches(service, companyId);

  let connectionsQuery = service
    .from("marketplace_connections")
    .select("company_id, channel")
    .eq("enabled", true);
  if (companyId) connectionsQuery = connectionsQuery.eq("company_id", companyId);
  const { data: connections } = await connectionsQuery;

  const channelsByCompany = new Map<string, Set<MarketplaceChannel>>();
  for (const conn of connections ?? []) {
    const set = channelsByCompany.get(conn.company_id) ?? new Set();
    set.add(conn.channel);
    channelsByCompany.set(conn.company_id, set);
  }

  const summary: DetectionSummary = {
    companiesChecked: channelsByCompany.size,
    discountProposals: 0,
    restoreProposals: 0,
    reconciledEvents,
  };

  const today = isoDate(0);

  for (const [company, channels] of channelsByCompany) {
    // Per-company discount ladder. No ladder => nothing is auto-discounted.
    const { data: tierRows } = await service
      .from("marketplace_discount_tiers")
      .select("max_days_left, discount_percent")
      .eq("company_id", company)
      .order("max_days_left", { ascending: true })
      .returns<DiscountTier[]>();

    const tiers = (tierRows ?? []).map((t) => ({
      max_days_left: Number(t.max_days_left),
      discount_percent: Number(t.discount_percent),
    }));
    if (tiers.length === 0) continue;
    const maxThreshold = tiers[tiers.length - 1].max_days_left;

    const { data: listingRows } = await service
      .from("marketplace_listings")
      .select(
        "id, company_id, channel, material_id, normal_sale_price, " +
          "current_price_state, applied_sale_price",
      )
      .eq("company_id", company)
      .in("channel", Array.from(channels))
      .is("deleted_at", null)
      .returns<DetectionListing[]>();

    const listings = listingRows ?? [];
    if (listings.length === 0) continue;

    const materialIds = Array.from(new Set(listings.map((l) => l.material_id)));

    // Satilabilir lotlardan, merdivenin en genis penceresine giren SKT'ler.
    const { data: lotRows } = await service
      .from("material_lots")
      .select("material_id, expiry_date")
      .eq("company_id", company)
      .in("material_id", materialIds)
      .eq("status", "released")
      .is("owner_customer_id", null)
      .is("deleted_at", null)
      .gt("quantity_on_hand", 0)
      .not("expiry_date", "is", null)
      .lte("expiry_date", isoDate(maxThreshold));

    const earliestExpiryByMaterial = new Map<string, string>();
    for (const lot of lotRows ?? []) {
      if (!lot.expiry_date) continue;
      const current = earliestExpiryByMaterial.get(lot.material_id);
      if (!current || lot.expiry_date < current) {
        earliestExpiryByMaterial.set(lot.material_id, lot.expiry_date);
      }
    }

    for (const listing of listings) {
      const normal = Number(listing.normal_sale_price);
      const earliestExpiry = earliestExpiryByMaterial.get(listing.material_id);
      const daysLeft =
        earliestExpiry === undefined
          ? undefined
          : Math.round(
              (new Date(earliestExpiry + "T00:00:00").getTime() -
                new Date(today + "T00:00:00").getTime()) /
                86_400_000,
            );

      const pct = pickTierPercent(tiers, daysLeft);
      const targetPrice = pct > 0 ? round2(normal * (1 - pct / 100)) : normal;
      const livePrice =
        listing.applied_sale_price !== null
          ? Number(listing.applied_sale_price)
          : normal;

      // Already at the right price (within a cent) -> nothing to do.
      if (Math.abs(targetPrice - livePrice) < 0.005) continue;

      if (targetPrice < normal) {
        const inserted = await insertProposal(service, {
          company_id: company,
          listing_id: listing.id,
          kind: "discount",
          old_price: livePrice,
          new_price: targetPrice,
          trigger_expiry_date: earliestExpiry ?? null,
          trigger_days_left: daysLeft ?? null,
        });
        if (inserted) summary.discountProposals += 1;
      } else {
        // Back up to (or above) normal -> restore.
        const inserted = await insertProposal(service, {
          company_id: company,
          listing_id: listing.id,
          kind: "restore",
          old_price: livePrice,
          new_price: normal,
        });
        if (inserted) summary.restoreProposals += 1;
      }
    }
  }

  return summary;
}
