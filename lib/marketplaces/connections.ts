import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { MarketplaceChannel } from "@/types/database";

import type { MarketplaceConnectionInfo } from "./types";

// DIKKAT: servis rolu RLS'i atlar. Cagiran taraf ilgili companyId icin
// requireCompanyUser/requireCompanyRole guard'indan GECMIS olmalidir
// (veya cron gibi sistem baglami olmalidir).
export async function getMarketplaceConnection(
  companyId: string,
  channel: MarketplaceChannel,
): Promise<MarketplaceConnectionInfo | null> {
  const service = createServiceRoleClient();
  const { data } = await service
    .from("marketplace_connections")
    .select("seller_id, api_key, api_secret")
    .eq("company_id", companyId)
    .eq("channel", channel)
    .eq("enabled", true)
    .maybeSingle();

  if (!data) return null;
  return {
    companyId,
    channel,
    sellerId: data.seller_id,
    apiKey: data.api_key,
    apiSecret: data.api_secret,
  };
}
