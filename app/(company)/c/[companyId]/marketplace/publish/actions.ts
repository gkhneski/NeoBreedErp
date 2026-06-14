"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import {
  createProducts,
  getBrandsByName,
  type CreateProductAttribute,
} from "@/lib/marketplaces/trendyol";
import { getMarketplaceConnection } from "@/lib/marketplaces/connections";
import { MarketplaceError } from "@/lib/marketplaces/types";
import { TENANT_FILES_BUCKET } from "@/lib/storage/attachments";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { MARKETPLACE_WRITE_ROLES, companyModulePath } from "@/types/roles";

export type PublishState = { error?: string; success?: string };

function num(v: FormDataEntryValue | null): number {
  return Number(String(v ?? "").replace(",", "."));
}

const schema = z.object({
  material_id: z.string().uuid(),
  barcode: z.string().trim().min(8).max(128),
  title: z.string().trim().min(3).max(255),
  description: z.string().trim().min(3).max(30000),
  brand_name: z.string().trim().min(1).max(255),
  category_id: z.number().int().positive(),
  list_price: z.number().positive(),
  sale_price: z.number().positive(),
  vat_rate: z.number().int().min(0).max(40),
  cargo_company_id: z.number().int().positive(),
  dimensional_weight: z.number().min(0).max(999),
  quantity: z.number().int().min(0),
  form_value_id: z.number().int().positive(),
  aroma_value_id: z.number().int().positive(),
});

export async function publishProductToTrendyol(
  companyIdInput: string,
  _prev: PublishState,
  formData: FormData,
): Promise<PublishState> {
  const parsed = schema.safeParse({
    material_id: formData.get("material_id"),
    barcode: formData.get("barcode"),
    title: formData.get("title"),
    description: formData.get("description"),
    brand_name: formData.get("brand_name"),
    category_id: num(formData.get("category_id")),
    list_price: num(formData.get("list_price")),
    sale_price: num(formData.get("sale_price")),
    vat_rate: num(formData.get("vat_rate")),
    cargo_company_id: num(formData.get("cargo_company_id")),
    dimensional_weight: num(formData.get("dimensional_weight")),
    quantity: num(formData.get("quantity")),
    form_value_id: num(formData.get("form_value_id")),
    aroma_value_id: num(formData.get("aroma_value_id")),
  });
  if (!parsed.success) {
    return { error: "Form alanlarını kontrol edin (zorunlu alanlar eksik veya hatalı)." };
  }
  const d = parsed.data;
  if (d.list_price < d.sale_price) {
    return { error: "Liste fiyatı satış fiyatından küçük olamaz." };
  }

  const { companyId } = await requireCompanyRole(
    companyIdInput,
    MARKETPLACE_WRITE_ROLES,
  );

  const connection = await getMarketplaceConnection(companyId, "trendyol");
  if (!connection) {
    return { error: "Trendyol bağlantısı yok veya devre dışı. Ayarlar → Pazaryeri Bağlantıları." };
  }

  // Images: upload to storage, expose via the public route so Trendyol can fetch.
  const files = formData
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return { error: "En az bir ürün görseli yükleyin (min ~1200×1800, beyaz zemin, üzerinde yazı yok)." };
  }
  if (files.length > 8) {
    return { error: "En fazla 8 görsel yükleyebilirsiniz." };
  }

  const service = createServiceRoleClient();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  if (!siteUrl) {
    return { error: "Sunucu yapılandırması eksik (NEXT_PUBLIC_SITE_URL)." };
  }

  const imageUrls: Array<{ url: string }> = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const buffer = Buffer.from(await file.arrayBuffer());
    const path = `${companyId}/products/${d.material_id}/trendyol/${i}`;
    const { error: upErr } = await service.storage
      .from(TENANT_FILES_BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });
    if (upErr) return { error: `Görsel yüklenemedi: ${upErr.message}` };
    imageUrls.push({
      url: `${siteUrl}/api/public/product-image/${companyId}/${d.material_id}/${i}`,
    });
  }

  // Resolve the Trendyol brand id from its name.
  let brandId: number;
  try {
    const brands = await getBrandsByName(connection, d.brand_name);
    const exact =
      brands.find(
        (b) => b.name.toLocaleLowerCase("tr") === d.brand_name.toLocaleLowerCase("tr"),
      ) ?? brands[0];
    if (!exact) {
      return { error: `Trendyol'da "${d.brand_name}" markası bulunamadı. Marka adını kontrol edin.` };
    }
    brandId = exact.id;
  } catch (error) {
    return {
      error:
        error instanceof MarketplaceError
          ? error.message
          : "Marka sorgulanırken hata oluştu.",
    };
  }

  const attributes: CreateProductAttribute[] = [
    { attributeId: 40, attributeValueId: d.form_value_id }, // Form
    { attributeId: 72, attributeValueId: d.aroma_value_id }, // Aroma
  ];

  let batchRequestId: string;
  try {
    const result = await createProducts(connection, [
      {
        barcode: d.barcode,
        title: d.title,
        productMainId: d.barcode,
        brandId,
        categoryId: d.category_id,
        quantity: d.quantity,
        stockCode: d.barcode,
        dimensionalWeight: d.dimensional_weight,
        description: d.description,
        currencyType: "TRY",
        listPrice: d.list_price,
        salePrice: d.sale_price,
        vatRate: d.vat_rate,
        cargoCompanyId: d.cargo_company_id,
        images: imageUrls,
        attributes,
      },
    ]);
    batchRequestId = result.batchRequestId;
  } catch (error) {
    return {
      error:
        error instanceof MarketplaceError
          ? error.message
          : "Trendyol'a gönderim sırasında beklenmeyen bir hata oluştu.",
    };
  }

  // Record the listing so price/stock/discount automation can manage it once
  // Trendyol approves the content.
  const supabase = await createServerSupabaseClient();
  const { error: insErr } = await supabase.from("marketplace_listings").insert({
    company_id: companyId,
    channel: "trendyol",
    material_id: d.material_id,
    barcode: d.barcode,
    stock_code: d.barcode,
    title: d.title,
    normal_sale_price: d.sale_price,
    normal_list_price: d.list_price,
    current_price_state: "normal",
    sync_status: "pending",
    content_batch_id: batchRequestId,
    publish_status: "pending",
  });
  if (insErr && insErr.code !== "23505") {
    return {
      error: `Trendyol'a gönderildi (takip: ${batchRequestId}) ama ERP kaydı oluşturulamadı: ${insErr.message}`,
    };
  }

  revalidatePath(companyModulePath(companyId, "marketplace"));
  return {
    success: `"${d.title}" Trendyol'a gönderildi. Trendyol içerik onayından sonra yayına girer (takip no: ${batchRequestId}).`,
  };
}
