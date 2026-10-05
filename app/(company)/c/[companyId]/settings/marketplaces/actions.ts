"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { getAdapter } from "@/lib/marketplaces/adapters";
import { getMarketplaceConnection } from "@/lib/marketplaces/connections";
import { MarketplaceError } from "@/lib/marketplaces/types";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

const connectionSchema = z.object({
  company_id: z.string().uuid(),
  channel: z.enum(["trendyol", "hepsiburada"]),
  seller_id: z.string().trim().min(1, "Satıcı ID gerekli.").max(64),
  api_key: z.string().trim().max(256).optional().or(z.literal("")),
  api_secret: z.string().trim().max(256).optional().or(z.literal("")),
  enabled: z.string().optional(),
});

export type ConnectionFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<
    Record<"seller_id" | "api_key" | "api_secret", string>
  >;
};

function marketplacesSettingsPath(companyId: string): string {
  return companyModulePath(companyId, "settings", "marketplaces");
}

export async function saveMarketplaceConnection(
  _prev: ConnectionFormState,
  formData: FormData,
): Promise<ConnectionFormState> {
  const parsed = connectionSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    channel: formData.get("channel") ?? "",
    seller_id: formData.get("seller_id") ?? "",
    api_key: formData.get("api_key") ?? "",
    api_secret: formData.get("api_secret") ?? "",
    enabled: formData.get("enabled") ?? undefined,
  });

  if (!parsed.success) {
    return { error: "Form alanlarını kontrol edin." };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    ["company_admin"],
  );
  const service = createServiceRoleClient();

  const { data: existing } = await service
    .from("marketplace_connections")
    .select("id, api_key, api_secret")
    .eq("company_id", companyId)
    .eq("channel", parsed.data.channel)
    .maybeSingle();

  const apiKey = parsed.data.api_key || existing?.api_key || "";
  const apiSecret = parsed.data.api_secret || existing?.api_secret || "";

  if (!apiKey || !apiSecret) {
    return {
      error: "API anahtarı ve gizli anahtar gerekli.",
      fieldErrors: {
        ...(apiKey ? {} : { api_key: "API anahtarı gerekli." }),
        ...(apiSecret ? {} : { api_secret: "Gizli anahtar gerekli." }),
      },
    };
  }

  const { error } = await service.from("marketplace_connections").upsert(
    {
      company_id: companyId,
      channel: parsed.data.channel,
      seller_id: parsed.data.seller_id,
      api_key: apiKey,
      api_secret: apiSecret,
      enabled: parsed.data.enabled === "on",
      updated_by: ctx.userId,
      ...(existing ? {} : { created_by: ctx.userId }),
    },
    { onConflict: "company_id,channel" },
  );

  if (error) {
    return { error: error.message };
  }

  revalidatePath(marketplacesSettingsPath(companyId));
  return { success: "Bağlantı kaydedildi." };
}

export async function testMarketplaceConnection(
  _prev: ConnectionFormState,
  formData: FormData,
): Promise<ConnectionFormState> {
  const companyIdInput = String(formData.get("company_id") ?? "");
  const channelInput = String(formData.get("channel") ?? "");
  const channelParsed = z
    .enum(["trendyol", "hepsiburada"])
    .safeParse(channelInput);
  if (!channelParsed.success) {
    return { error: "Geçersiz kanal." };
  }

  const { companyId } = await requireCompanyRole(companyIdInput, [
    "company_admin",
  ]);

  const connection = await getMarketplaceConnection(
    companyId,
    channelParsed.data,
  );
  if (!connection) {
    return {
      error: "Önce bağlantı bilgilerini kaydedin (ve aktif olduğundan emin olun).",
    };
  }

  try {
    await getAdapter(channelParsed.data).verifyConnection(connection);
  } catch (error) {
    const message =
      error instanceof MarketplaceError
        ? error.message
        : "Bağlantı testi sırasında beklenmeyen bir hata oluştu.";
    return { error: message };
  }

  const service = createServiceRoleClient();
  await service
    .from("marketplace_connections")
    .update({ last_verified_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("channel", channelParsed.data);

  revalidatePath(marketplacesSettingsPath(companyId));
  return { success: "Bağlantı doğrulandı — Trendyol API erişimi çalışıyor." };
}

export type AutoShipFormState = {
  error?: string;
  success?: string;
  // Açmadan önce uyarı: listelenmiş ama LTD'de satılabilir stoğu olmayan ürünler.
  needsConfirm?: { count: number; names: string[] };
};

async function listedProductsWithoutStock(
  companyId: string,
  channel: "trendyol" | "hepsiburada",
): Promise<string[]> {
  const service = createServiceRoleClient();
  const [{ data: listings }, { data: sellable }] = await Promise.all([
    service
      .from("marketplace_listings")
      .select("material_id, title, materials:material_id(name)")
      .eq("company_id", companyId)
      .eq("channel", channel)
      .is("deleted_at", null)
      .returns<
        Array<{
          material_id: string;
          title: string | null;
          materials: { name: string } | null;
        }>
      >(),
    service
      .from("sellable_lots")
      .select("material_id, quantity_on_hand")
      .eq("company_id", companyId)
      .is("owner_customer_id", null),
  ]);

  const stocked = new Set<string>();
  for (const row of sellable ?? []) {
    if (Number(row.quantity_on_hand) > 0) stocked.add(row.material_id);
  }
  return (listings ?? [])
    .filter((l) => !stocked.has(l.material_id))
    .map((l) => l.materials?.name ?? l.title ?? l.material_id)
    .sort((a, b) => a.localeCompare(b, "tr"));
}

export async function setAutoShip(
  _prev: AutoShipFormState,
  formData: FormData,
): Promise<AutoShipFormState> {
  const parsed = z
    .object({
      company_id: z.string().uuid(),
      channel: z.enum(["trendyol", "hepsiburada"]),
      enable: z.enum(["1", "0"]),
      confirm: z.string().optional(),
    })
    .safeParse({
      company_id: formData.get("company_id") ?? "",
      channel: formData.get("channel") ?? "",
      enable: formData.get("enable") ?? "",
      confirm: formData.get("confirm") ?? undefined,
    });
  if (!parsed.success) return { error: "Geçersiz istek." };

  const { ctx, companyId } = await requireCompanyRole(parsed.data.company_id, [
    "company_admin",
  ]);
  const service = createServiceRoleClient();
  const { channel } = parsed.data;
  const enable = parsed.data.enable === "1";

  const { data: existing } = await service
    .from("marketplace_connections")
    .select("auto_ship, enabled")
    .eq("company_id", companyId)
    .eq("channel", channel)
    .maybeSingle();

  if (!existing) {
    return { error: "Önce bağlantı bilgilerini kaydedin." };
  }

  if (enable && !existing.enabled) {
    return { error: "Bağlantı devre dışı; önce bağlantıyı aktif edin." };
  }

  if (enable && !existing.auto_ship && parsed.data.confirm !== "1") {
    const names = await listedProductsWithoutStock(companyId, channel);
    if (names.length > 0) {
      return { needsConfirm: { count: names.length, names: names.slice(0, 40) } };
    }
  }

  const { error } = await service
    .from("marketplace_connections")
    .update({
      auto_ship: enable,
      ...(enable && !existing.auto_ship
        ? { auto_ship_enabled_at: new Date().toISOString() }
        : {}),
      updated_by: ctx.userId,
    })
    .eq("company_id", companyId)
    .eq("channel", channel);

  if (error) return { error: error.message };

  revalidatePath(marketplacesSettingsPath(companyId));
  revalidatePath(companyModulePath(companyId, "shipments"));
  return {
    success: enable
      ? "Otomatik sevkiyat açıldı. Bu andan sonra kargoya verilen siparişler stoktan düşülür."
      : "Otomatik sevkiyat kapatıldı. Siparişler yalnızca listelenir, stok elle düşülür.",
  };
}
