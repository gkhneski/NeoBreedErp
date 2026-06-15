import "server-only";

import type { MarketplaceChannel } from "@/types/database";

export interface MarketplaceConnectionInfo {
  companyId: string;
  channel: MarketplaceChannel;
  sellerId: string;
  apiKey: string;
  apiSecret: string;
}

export interface RemoteListing {
  barcode: string;
  title: string;
  stockCode: string | null;
  salePrice: number;
  listPrice: number;
  quantity: number;
  approved: boolean;
  onSale: boolean;
  imageUrl: string | null;
}

export interface PriceStockItem {
  barcode: string;
  salePrice: number;
  listPrice: number;
  // undefined = stok gonderme (sync_stock kapali)
  quantity?: number;
}

export interface BatchResult {
  complete: boolean;
  items: Array<{ barcode: string; ok: boolean; error?: string }>;
}

export class MarketplaceError extends Error {
  constructor(
    message: string,
    public httpStatus?: number,
    public retryable = false,
  ) {
    super(message);
    this.name = "MarketplaceError";
  }
}

export interface MarketplaceAdapter {
  verifyConnection(conn: MarketplaceConnectionInfo): Promise<void>;
  fetchListings(conn: MarketplaceConnectionInfo): Promise<RemoteListing[]>;
  pushPriceAndStock(
    conn: MarketplaceConnectionInfo,
    items: PriceStockItem[],
  ): Promise<{ batchRequestId: string }>;
  getBatchStatus(
    conn: MarketplaceConnectionInfo,
    batchRequestId: string,
  ): Promise<BatchResult>;
}

export const CHANNEL_LABELS: Record<MarketplaceChannel, string> = {
  trendyol: "Trendyol",
  hepsiburada: "Hepsiburada",
};
