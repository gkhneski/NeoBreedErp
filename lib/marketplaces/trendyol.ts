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
  images?: Array<{ url?: string }>;
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
    imageUrl: p.images?.[0]?.url ?? null,
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

// =============================================================================
// Model B — publish a product from the ERP to Trendyol (catalog + create).
// These are Trendyol-specific helpers, not part of the generic adapter.
// =============================================================================

export type TrendyolCategoryAttribute = {
  attributeId: number;
  name: string;
  required: boolean;
  allowCustom: boolean;
  values: Array<{ id: number; name: string }>;
};

export async function getCategoryAttributes(
  conn: MarketplaceConnectionInfo,
  categoryId: number,
): Promise<TrendyolCategoryAttribute[]> {
  const data = (await trendyolFetch(
    conn,
    `/integration/product/product-categories/${categoryId}/attributes`,
  )) as {
    categoryAttributes?: Array<{
      attribute: { id: number; name: string };
      required: boolean;
      allowCustom: boolean;
      attributeValues?: Array<{ id: number; name: string }>;
    }>;
  } | null;

  return (data?.categoryAttributes ?? []).map((a) => ({
    attributeId: a.attribute.id,
    name: a.attribute.name,
    required: a.required,
    allowCustom: a.allowCustom,
    values: (a.attributeValues ?? []).map((v) => ({ id: v.id, name: v.name })),
  }));
}

export async function getBrandsByName(
  conn: MarketplaceConnectionInfo,
  name: string,
): Promise<Array<{ id: number; name: string }>> {
  const data = (await trendyolFetch(
    conn,
    `/integration/product/brands/by-name?name=${encodeURIComponent(name)}`,
  )) as Array<{ id: number; name: string }> | { brands?: Array<{ id: number; name: string }> } | null;
  if (Array.isArray(data)) return data;
  return data?.brands ?? [];
}

export type TrendyolAddress = {
  id: number;
  isShipmentAddress: boolean;
  isReturningAddress: boolean;
  fullAddress: string | null;
};

export async function getSupplierAddresses(
  conn: MarketplaceConnectionInfo,
): Promise<TrendyolAddress[]> {
  const data = (await trendyolFetch(
    conn,
    `/integration/sellers/${conn.sellerId}/addresses`,
  )) as { supplierAddresses?: TrendyolAddress[] } | null;
  return data?.supplierAddresses ?? [];
}

export type CreateProductAttribute =
  | { attributeId: number; attributeValueId: number }
  | { attributeId: number; customAttributeValue: string };

export type CreateProductItem = {
  barcode: string;
  title: string;
  productMainId: string;
  brandId: number;
  categoryId: number;
  quantity: number;
  stockCode: string;
  dimensionalWeight: number;
  description: string;
  currencyType: "TRY";
  listPrice: number;
  salePrice: number;
  vatRate: number;
  cargoCompanyId: number;
  shipmentAddressId?: number;
  returningAddressId?: number;
  images: Array<{ url: string }>;
  attributes: CreateProductAttribute[];
};

// Trendyol'un ürün GET'inden dönen ham kayıt (içerik güncellemesi için meta).
export type TrendyolRawProduct = {
  barcode?: string;
  title?: string;
  description?: string;
  productMainId?: string | number;
  brandId?: number;
  categoryId?: number;
  pimCategoryId?: number;
  stockCode?: string | null;
  dimensionalWeight?: number;
  vatRate?: number;
  images?: Array<{ url?: string }>;
  attributes?: Array<{
    attributeId?: number;
    attributeValueId?: number;
    customAttributeValue?: string;
  }>;
  salePrice?: number;
  listPrice?: number;
  quantity?: number;
};

// Tek ürünün tam Trendyol kaydını barkoddan çek (içerik güncellemesi öncesi).
export async function getRawProductByBarcode(
  conn: MarketplaceConnectionInfo,
  barcode: string,
): Promise<TrendyolRawProduct | null> {
  const data = (await trendyolFetch(
    conn,
    `/integration/product/sellers/${conn.sellerId}/products?barcode=${encodeURIComponent(
      barcode,
    )}&size=1`,
  )) as { content?: TrendyolRawProduct[]; items?: TrendyolRawProduct[] } | null;
  const rows = data?.content ?? data?.items ?? [];
  return rows[0] ?? null;
}

// Ham kayıt + yeni başlık/açıklama → updateProducts için tam item. Meta'yı OLDUĞU
// GİBİ korur (kategori/marka/attribute uydurmaz); eksikse net hata fırlatır.
export function buildContentUpdateItem(
  raw: TrendyolRawProduct,
  opts: { title: string; description: string; stockCodeFallback: string },
): CreateProductItem {
  const barcode = raw.barcode;
  if (!barcode) throw new MarketplaceError("Trendyol ürün barkodu okunamadı.");
  const categoryId = raw.pimCategoryId ?? raw.categoryId;
  if (!categoryId) throw new MarketplaceError("Trendyol kategori bilgisi alınamadı.");
  if (!raw.brandId) throw new MarketplaceError("Trendyol marka bilgisi alınamadı.");

  const images = (raw.images ?? [])
    .filter((i): i is { url: string } => Boolean(i.url))
    .map((i) => ({ url: i.url }));
  if (images.length === 0) {
    throw new MarketplaceError("Trendyol ürün görseli bulunamadı; içerik güncellenemiyor.");
  }

  const attributes: CreateProductAttribute[] = [];
  for (const a of raw.attributes ?? []) {
    if (a.attributeId == null) continue;
    if (a.attributeValueId != null) {
      attributes.push({ attributeId: a.attributeId, attributeValueId: a.attributeValueId });
    } else if (a.customAttributeValue) {
      attributes.push({ attributeId: a.attributeId, customAttributeValue: a.customAttributeValue });
    }
  }

  // Fiyat/stoğu OLDUĞU GİBİ koru (içerik endpoint'i yönetmese de geçerli kalsın).
  const salePrice = Number(raw.salePrice ?? 0);
  const listPrice = Math.max(Number(raw.listPrice ?? 0), salePrice);
  return {
    barcode,
    title: opts.title,
    productMainId: String(raw.productMainId ?? barcode),
    brandId: raw.brandId,
    categoryId,
    quantity: Number(raw.quantity ?? 0),
    stockCode: raw.stockCode ?? opts.stockCodeFallback,
    dimensionalWeight: raw.dimensionalWeight ?? 0,
    description: opts.description,
    currencyType: "TRY",
    listPrice,
    salePrice,
    vatRate: raw.vatRate ?? 0,
    cargoCompanyId: 0,
    images,
    attributes,
  };
}

// Mevcut ürünün İÇERİĞİNİ (başlık/açıklama/attribute/görsel) günceller — PUT.
// Fiyat/stok'a dokunmaz (o ayrı endpoint). Trendyol içeriği yeniden onaya alır.
export async function updateProductContent(
  conn: MarketplaceConnectionInfo,
  items: CreateProductItem[],
): Promise<{ batchRequestId: string }> {
  if (items.length === 0) {
    throw new MarketplaceError("Güncellenecek ürün yok.");
  }
  const data = (await trendyolFetch(
    conn,
    `/integration/product/sellers/${conn.sellerId}/products`,
    { method: "PUT", body: JSON.stringify({ items }) },
  )) as { batchRequestId?: string } | null;

  if (!data?.batchRequestId) {
    throw new MarketplaceError(
      "Trendyol içerik güncellemesi bir takip numarası (batchRequestId) döndürmedi.",
    );
  }
  return { batchRequestId: data.batchRequestId };
}

export type TrendyolOrder = {
  orderNumber: string;
  status: string;
  customerName: string;
  orderDate: string | null;
  totalPrice: number;
  lines: Array<{ name: string; quantity: number; barcode: string }>;
};

// Recent orders (shipment packages), newest first. Used to alert the depot.
export async function getOrders(
  conn: MarketplaceConnectionInfo,
): Promise<TrendyolOrder[]> {
  const data = (await trendyolFetch(
    conn,
    `/integration/order/sellers/${conn.sellerId}/orders?size=50&orderByField=PackageLastModifiedDate&orderByDirection=DESC`,
  )) as {
    content?: Array<{
      orderNumber?: string | number;
      id?: string | number;
      shipmentPackageStatus?: string;
      status?: string;
      customerFirstName?: string;
      customerLastName?: string;
      orderDate?: number;
      totalPrice?: number;
      grossAmount?: number;
      lines?: Array<{ productName?: string; quantity?: number; barcode?: string }>;
    }>;
  } | null;

  return (data?.content ?? [])
    .map((o) => ({
      orderNumber: String(o.orderNumber ?? o.id ?? ""),
      status: o.shipmentPackageStatus ?? o.status ?? "",
      customerName: `${o.customerFirstName ?? ""} ${o.customerLastName ?? ""}`.trim(),
      orderDate: o.orderDate ? new Date(Number(o.orderDate)).toISOString() : null,
      totalPrice: Number(o.totalPrice ?? o.grossAmount ?? 0),
      lines: (o.lines ?? []).map((l) => ({
        name: l.productName ?? "",
        quantity: Number(l.quantity ?? 0),
        barcode: l.barcode ?? "",
      })),
    }))
    .filter((o) => o.orderNumber);
}

// Creates (or updates by barcode) products on Trendyol. Returns the async
// batchRequestId; approval is then polled via getBatchStatus.
export async function createProducts(
  conn: MarketplaceConnectionInfo,
  items: CreateProductItem[],
): Promise<{ batchRequestId: string }> {
  if (items.length === 0) {
    throw new MarketplaceError("Gönderilecek ürün yok.");
  }
  for (const item of items) {
    if (item.images.length === 0) {
      throw new MarketplaceError(
        `En az bir ürün görseli gerekli (barkod ${item.barcode}).`,
      );
    }
    if (item.listPrice < item.salePrice) {
      throw new MarketplaceError(
        `Liste fiyatı satış fiyatından küçük olamaz (barkod ${item.barcode}).`,
      );
    }
  }

  const data = (await trendyolFetch(
    conn,
    `/integration/product/sellers/${conn.sellerId}/products`,
    { method: "POST", body: JSON.stringify({ items }) },
  )) as { batchRequestId?: string } | null;

  if (!data?.batchRequestId) {
    throw new MarketplaceError(
      "Trendyol ürün oluşturma bir takip numarası (batchRequestId) döndürmedi.",
    );
  }
  return { batchRequestId: data.batchRequestId };
}
