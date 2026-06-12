import "server-only";

import {
  MarketplaceError,
  type BatchResult,
  type MarketplaceAdapter,
  type MarketplaceConnectionInfo,
  type PriceStockItem,
  type RemoteListing,
} from "./types";

const BASE_URL = "https://apigw.trendyol.com";
const PAGE_SIZE = 200;
const MAX_LISTINGS = 5000;
const MAX_ITEMS_PER_PUSH = 1000;

function authHeaders(conn: MarketplaceConnectionInfo): HeadersInit {
  const token = Buffer.from(`${conn.apiKey}:${conn.apiSecret}`).toString(
    "base64",
  );
  return {
    Authorization: `Basic ${token}`,
    "User-Agent": `${conn.sellerId} - SelfIntegration`,
    "Content-Type": "application/json",
  };
}

async function trendyolFetch(
  conn: MarketplaceConnectionInfo,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { ...authHeaders(conn), ...init?.headers },
      cache: "no-store",
    });
  } catch {
    throw new MarketplaceError(
      "Trendyol'a ulaşılamadı. Ağ bağlantısını kontrol edin.",
      undefined,
      true,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new MarketplaceError(
      "Trendyol kimlik doğrulaması başarısız. Satıcı ID, API anahtarı ve gizli anahtarı kontrol edin.",
      response.status,
    );
  }
  if (response.status === 429) {
    throw new MarketplaceError(
      "Trendyol istek limiti aşıldı. Birkaç dakika sonra tekrar deneyin.",
      429,
      true,
    );
  }
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as {
        errors?: Array<{ message?: string }>;
        message?: string;
      };
      detail =
        body.errors?.map((e) => e.message).filter(Boolean).join("; ") ??
        body.message ??
        "";
    } catch {
      // govde JSON degilse detay yok
    }
    throw new MarketplaceError(
      `Trendyol hatası (HTTP ${response.status})${detail ? `: ${detail}` : "."}`,
      response.status,
    );
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

type TrendyolProduct = {
  barcode?: string;
  title?: string;
  stockCode?: string | null;
  salePrice?: number;
  listPrice?: number;
  quantity?: number;
  approved?: boolean;
  onSale?: boolean;
  archived?: boolean;
};

type TrendyolProductsPage = {
  content?: TrendyolProduct[];
  items?: TrendyolProduct[];
  totalPages?: number;
};

function mapProduct(p: TrendyolProduct): RemoteListing | null {
  if (!p.barcode) return null;
  return {
    barcode: p.barcode,
    title: p.title ?? "",
    stockCode: p.stockCode ?? null,
    salePrice: Number(p.salePrice ?? 0),
    listPrice: Number(p.listPrice ?? 0),
    quantity: Number(p.quantity ?? 0),
    approved: p.approved ?? false,
    onSale: p.onSale ?? false,
  };
}

export const trendyolAdapter: MarketplaceAdapter = {
  async verifyConnection(conn) {
    await trendyolFetch(
      conn,
      `/integration/product/sellers/${conn.sellerId}/products?page=0&size=1`,
    );
  },

  async fetchListings(conn) {
    const listings: RemoteListing[] = [];
    let page = 0;
    for (;;) {
      const data = (await trendyolFetch(
        conn,
        `/integration/product/sellers/${conn.sellerId}/products?page=${page}&size=${PAGE_SIZE}`,
      )) as TrendyolProductsPage | null;

      const rows = data?.content ?? data?.items ?? [];
      for (const row of rows) {
        if (row.archived) continue;
        const mapped = mapProduct(row);
        if (mapped) listings.push(mapped);
      }

      page += 1;
      const lastPage =
        rows.length < PAGE_SIZE ||
        (data?.totalPages !== undefined && page >= data.totalPages);
      if (lastPage || listings.length >= MAX_LISTINGS) break;
    }
    return listings;
  },

  async pushPriceAndStock(conn, items) {
    if (items.length === 0) {
      throw new MarketplaceError("Gönderilecek fiyat kalemi yok.");
    }
    if (items.length > MAX_ITEMS_PER_PUSH) {
      throw new MarketplaceError(
        `Tek istekte en fazla ${MAX_ITEMS_PER_PUSH} kalem gönderilebilir.`,
      );
    }
    for (const item of items) {
      if (item.listPrice < item.salePrice) {
        throw new MarketplaceError(
          `Liste fiyatı satış fiyatından küçük olamaz (barkod ${item.barcode}).`,
        );
      }
    }

    const data = (await trendyolFetch(
      conn,
      `/integration/inventory/sellers/${conn.sellerId}/products/price-and-inventory`,
      { method: "POST", body: JSON.stringify({ items }) },
    )) as { batchRequestId?: string } | null;

    if (!data?.batchRequestId) {
      throw new MarketplaceError(
        "Trendyol fiyat güncellemesi bir takip numarası (batchRequestId) döndürmedi.",
      );
    }
    return { batchRequestId: data.batchRequestId };
  },

  async getBatchStatus(conn, batchRequestId) {
    const data = (await trendyolFetch(
      conn,
      `/integration/product/sellers/${conn.sellerId}/products/batch-requests/${batchRequestId}`,
    )) as {
      status?: string;
      items?: Array<{
        requestItem?: { barcode?: string };
        status?: string;
        failureReasons?: string[];
      }>;
    } | null;

    const items = (data?.items ?? []).map((item) => {
      const status = (item.status ?? "").toUpperCase();
      return {
        barcode: item.requestItem?.barcode ?? "",
        ok: status === "SUCCESS",
        error:
          status === "FAILED"
            ? (item.failureReasons ?? []).join("; ") || "Bilinmeyen hata"
            : undefined,
      };
    });

    const batchStatus = (data?.status ?? "").toUpperCase();
    const itemsPending = items.some(
      (_, i) =>
        ((data?.items?.[i]?.status ?? "").toUpperCase() || "PROCESSING") ===
        "PROCESSING",
    );
    const complete =
      batchStatus === "COMPLETED" || (items.length > 0 && !itemsPending);

    return { complete, items } satisfies BatchResult;
  },
};

export type { PriceStockItem };
