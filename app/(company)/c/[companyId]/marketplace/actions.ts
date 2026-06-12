"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { runDiscountDetection } from "@/lib/marketplaces/discount-engine";
import {
  pushApprovedEvent,
  type PushListingContext,
} from "@/lib/marketplaces/push";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import {
  MARKETPLACE_APPROVE_ROLES,
  MASTER_DATA_WRITE_ROLES,
  companyModulePath,
} from "@/types/roles";

function marketplacePath(companyId: string): string {
  return companyModulePath(companyId, "marketplace");
}

// --- Listing mappings (import) ---------------------------------------------

const mappingSchema = z.object({
  company_id: z.string().uuid(),
  mappings: z
    .array(
      z.object({
        material_id: z.string().uuid(),
        barcode: z.string().trim().min(1).max(128),
        stock_code: z.string().trim().max(128).nullable(),
        title: z.string().trim().max(512).nullable(),
        sale_price: z.number().positive(),
        list_price: z.number().positive().nullable(),
      }),
    )
    .min(1, "En az bir eşleştirme seçin."),
});

export type MappingActionState = {
  error?: string;
  success?: string;
};

export async function saveListingMappings(
  companyIdInput: string,
  mappingsInput: Array<{
    material_id: string;
    barcode: string;
    stock_code: string | null;
    title: string | null;
    sale_price: number;
    list_price: number | null;
  }>,
): Promise<MappingActionState> {
  const parsed = mappingSchema.safeParse({
    company_id: companyIdInput,
    mappings: mappingsInput,
  });
  if (!parsed.success) {
    return { error: "Eşleştirme verisi geçersiz. En az bir ürün seçin." };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  let created = 0;
  for (const mapping of parsed.data.mappings) {
    const listPrice =
      mapping.list_price !== null &&
      mapping.list_price >= mapping.sale_price
        ? mapping.list_price
        : null;

    const { error } = await supabase.from("marketplace_listings").insert({
      company_id: companyId,
      channel: "trendyol",
      material_id: mapping.material_id,
      barcode: mapping.barcode,
      stock_code: mapping.stock_code,
      title: mapping.title,
      normal_sale_price: mapping.sale_price,
      normal_list_price: listPrice,
      current_price_state: "normal",
      created_by: ctx.userId,
      updated_by: ctx.userId,
    });

    if (error) {
      if (error.code === "23505") {
        return {
          error: `"${mapping.barcode}" barkodu veya seçilen ürün zaten eşleştirilmiş. Önceki seçimleriniz kaydedildi (${created}).`,
        };
      }
      return { error: error.message };
    }
    created += 1;
  }

  revalidatePath(marketplacePath(companyId));
  return { success: `${created} listing eşleştirildi.` };
}

export async function refreshListingCache(
  companyIdInput: string,
  updates: Array<{
    listing_id: string;
    stock_code: string | null;
    title: string | null;
  }>,
): Promise<void> {
  const { ctx, companyId } = await requireCompanyRole(
    companyIdInput,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  for (const update of updates) {
    await supabase
      .from("marketplace_listings")
      .update({
        stock_code: update.stock_code,
        title: update.title,
        updated_by: ctx.userId,
      })
      .eq("id", update.listing_id)
      .eq("company_id", companyId);
  }
}

// --- Listing rule -----------------------------------------------------------

const ruleSchema = z
  .object({
    company_id: z.string().uuid(),
    listing_id: z.string().uuid(),
    normal_sale_price: z
      .string()
      .trim()
      .min(1, "Normal satış fiyatı gerekli.")
      .transform((v) => Number(v.replace(",", ".")))
      .refine((v) => Number.isFinite(v) && v > 0, {
        message: "Fiyat pozitif olmalı.",
      }),
    normal_list_price: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? Number(v.replace(",", ".")) : null))
      .refine((v) => v === null || (Number.isFinite(v) && v > 0), {
        message: "Liste fiyatı pozitif olmalı.",
      }),
    discount_price: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? Number(v.replace(",", ".")) : null))
      .refine((v) => v === null || (Number.isFinite(v) && v > 0), {
        message: "İndirimli fiyat pozitif olmalı.",
      }),
    discount_threshold_days: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? Number(v) : null))
      .refine(
        (v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 3650),
        { message: "Eşik 1-3650 gün arasında olmalı." },
      ),
    sync_stock: z.string().optional(),
  })
  .refine(
    (d) => d.normal_list_price === null || d.normal_list_price >= d.normal_sale_price,
    {
      message: "Liste fiyatı satış fiyatından küçük olamaz.",
      path: ["normal_list_price"],
    },
  )
  .refine(
    (d) => d.discount_price === null || d.discount_price < d.normal_sale_price,
    {
      message: "İndirimli fiyat normal satış fiyatından düşük olmalı.",
      path: ["discount_price"],
    },
  );

export type RuleFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<
    Record<
      | "normal_sale_price"
      | "normal_list_price"
      | "discount_price"
      | "discount_threshold_days",
      string
    >
  >;
};

export async function saveListingRule(
  _prev: RuleFormState,
  formData: FormData,
): Promise<RuleFormState> {
  const parsed = ruleSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    listing_id: formData.get("listing_id") ?? "",
    normal_sale_price: formData.get("normal_sale_price") ?? "",
    normal_list_price: formData.get("normal_list_price") ?? "",
    discount_price: formData.get("discount_price") ?? "",
    discount_threshold_days: formData.get("discount_threshold_days") ?? "",
    sync_stock: formData.get("sync_stock") ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors: RuleFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<
        RuleFormState["fieldErrors"]
      >;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("marketplace_listings")
    .update({
      normal_sale_price: parsed.data.normal_sale_price,
      normal_list_price: parsed.data.normal_list_price,
      discount_price: parsed.data.discount_price,
      discount_threshold_days: parsed.data.discount_threshold_days,
      sync_stock: parsed.data.sync_stock === "on",
      updated_by: ctx.userId,
    })
    .eq("id", parsed.data.listing_id)
    .eq("company_id", companyId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(marketplacePath(companyId));
  return { success: "Kural kaydedildi." };
}

// --- Manual push ------------------------------------------------------------

export type SimpleActionResult = { ok: true } | { ok: false; error: string };

async function loadListingForPush(
  companyId: string,
  listingId: string,
): Promise<
  | { ok: true; listing: PushListingContext & { normal_sale_price: number } }
  | { ok: false; error: string }
> {
  const supabase = await createServerSupabaseClient();
  const { data: listing } = await supabase
    .from("marketplace_listings")
    .select(
      "id, channel, material_id, barcode, normal_sale_price, normal_list_price, sync_stock",
    )
    .eq("id", listingId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!listing) return { ok: false, error: "Listing bulunamadı." };
  return {
    ok: true,
    listing: {
      ...listing,
      normal_sale_price: Number(listing.normal_sale_price),
      normal_list_price:
        listing.normal_list_price !== null
          ? Number(listing.normal_list_price)
          : null,
    },
  };
}

export async function pushListingPrice(
  companyIdInput: string,
  listingIdInput: string,
): Promise<SimpleActionResult> {
  const inputs = z
    .object({ company: z.string().uuid(), listing: z.string().uuid() })
    .safeParse({ company: companyIdInput, listing: listingIdInput });
  if (!inputs.success) return { ok: false, error: "Geçersiz istek." };

  const { ctx, companyId } = await requireCompanyRole(
    inputs.data.company,
    MASTER_DATA_WRITE_ROLES,
  );

  const loaded = await loadListingForPush(companyId, inputs.data.listing);
  if (!loaded.ok) return loaded;
  const listing = loaded.listing;

  const service = createServiceRoleClient();
  const { data: event, error: insertError } = await service
    .from("marketplace_price_events")
    .insert({
      company_id: companyId,
      listing_id: listing.id,
      kind: "manual",
      old_price: null,
      new_price: listing.normal_sale_price,
      created_by: ctx.userId,
    })
    .select("id")
    .single();

  if (insertError || !event) {
    if (insertError?.code === "23505") {
      return {
        ok: false,
        error:
          "Bu listing için bekleyen bir öneri var. Önce onu onaylayın veya reddedin.",
      };
    }
    return { ok: false, error: insertError?.message ?? "Kayıt oluşturulamadı." };
  }

  const result = await pushApprovedEvent(
    service,
    event.id,
    companyId,
    listing,
    listing.normal_sale_price,
    ctx.userId,
  );

  revalidatePath(marketplacePath(companyId));
  return result;
}

// --- Approve / dismiss ------------------------------------------------------

export async function approvePriceEvent(
  companyIdInput: string,
  eventIdInput: string,
): Promise<SimpleActionResult> {
  const inputs = z
    .object({ company: z.string().uuid(), event: z.string().uuid() })
    .safeParse({ company: companyIdInput, event: eventIdInput });
  if (!inputs.success) return { ok: false, error: "Geçersiz istek." };

  const { ctx, companyId } = await requireCompanyRole(
    inputs.data.company,
    MARKETPLACE_APPROVE_ROLES,
  );

  // Uyelik RLS'i tenant kanitidir: olay kendi firmasina aitse okunur.
  const supabase = await createServerSupabaseClient();
  const { data: event } = await supabase
    .from("marketplace_price_events")
    .select(
      "id, status, new_price, " +
        "listing:listing_id(id, channel, material_id, barcode, normal_sale_price, normal_list_price, sync_stock, deleted_at)",
    )
    .eq("id", inputs.data.event)
    .eq("company_id", companyId)
    .maybeSingle<{
      id: string;
      status: string;
      new_price: number;
      listing: {
        id: string;
        channel: "trendyol" | "hepsiburada";
        material_id: string;
        barcode: string;
        normal_sale_price: number;
        normal_list_price: number | null;
        sync_stock: boolean;
        deleted_at: string | null;
      } | null;
    }>();

  if (!event) return { ok: false, error: "Öneri bulunamadı." };
  if (event.status !== "pending") {
    return { ok: false, error: "Bu öneri zaten işlenmiş." };
  }
  if (!event.listing || event.listing.deleted_at) {
    return { ok: false, error: "Listing silinmiş; öneri uygulanamaz." };
  }

  const service = createServiceRoleClient();
  const result = await pushApprovedEvent(
    service,
    event.id,
    companyId,
    {
      id: event.listing.id,
      channel: event.listing.channel,
      material_id: event.listing.material_id,
      barcode: event.listing.barcode,
      normal_sale_price: Number(event.listing.normal_sale_price),
      normal_list_price:
        event.listing.normal_list_price !== null
          ? Number(event.listing.normal_list_price)
          : null,
      sync_stock: event.listing.sync_stock,
    },
    Number(event.new_price),
    ctx.userId,
  );

  revalidatePath(marketplacePath(companyId));
  revalidatePath(companyModulePath(companyId));
  return result;
}

export async function dismissPriceEvent(
  companyIdInput: string,
  eventIdInput: string,
): Promise<SimpleActionResult> {
  const inputs = z
    .object({ company: z.string().uuid(), event: z.string().uuid() })
    .safeParse({ company: companyIdInput, event: eventIdInput });
  if (!inputs.success) return { ok: false, error: "Geçersiz istek." };

  const { ctx, companyId } = await requireCompanyRole(
    inputs.data.company,
    MARKETPLACE_APPROVE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("marketplace_price_events")
    .update({
      status: "dismissed",
      acted_at: new Date().toISOString(),
      acted_by: ctx.userId,
    })
    .eq("id", inputs.data.event)
    .eq("company_id", companyId)
    .eq("status", "pending");

  if (error) return { ok: false, error: error.message };

  revalidatePath(marketplacePath(companyId));
  revalidatePath(companyModulePath(companyId));
  return { ok: true };
}

// --- On-demand detection ----------------------------------------------------

export async function runDetectionNow(
  companyIdInput: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const parsed = z.string().uuid().safeParse(companyIdInput);
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const { companyId } = await requireCompanyRole(
    parsed.data,
    MASTER_DATA_WRITE_ROLES,
  );

  const service = createServiceRoleClient();
  const summary = await runDiscountDetection(service, companyId);

  revalidatePath(marketplacePath(companyId));
  return {
    ok: true,
    message: `Kontrol tamamlandı: ${summary.discountProposals} indirim, ${summary.restoreProposals} normale dönüş önerisi oluşturuldu.`,
  };
}
