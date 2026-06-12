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
