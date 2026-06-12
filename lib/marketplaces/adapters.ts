import "server-only";

import type { MarketplaceChannel } from "@/types/database";

import { trendyolAdapter } from "./trendyol";
import { MarketplaceError, type MarketplaceAdapter } from "./types";

export function getAdapter(channel: MarketplaceChannel): MarketplaceAdapter {
  if (channel === "trendyol") return trendyolAdapter;
  throw new MarketplaceError(
    "Hepsiburada entegrasyonu henüz aktif değil (Faz 8c).",
  );
}
