"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { withFlash } from "@/lib/flash";
import { autoShipOne } from "@/lib/marketplaces/auto-ship";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { SHIPMENT_WRITE_ROLES, companyModulePath } from "@/types/roles";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

const shipmentCreateSchema = z
  .object({
    company_id: z.string().uuid(),
    channel: z.enum(["ecza", "sahis", "trendyol", "hepsiburada", "diger"], {
      message: "Kanal seçiniz.",
    }),
    channel_id: z
      .string()
      .uuid()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : null)),
    recipient_mode: z.enum(["existing", "new"]),
    customer_id: z
      .string()
      .uuid()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : null)),
    nc_name: optionalText(200),
    nc_contact_name: optionalText(200),
    nc_phone: optionalText(64),
    nc_email: optionalText(200).refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Geçerli bir e-posta giriniz.",
    ),
    nc_tax_office: optionalText(120),
    nc_tax_number: optionalText(64),
    nc_city: optionalText(80),
    nc_district: optionalText(80),
    nc_address: optionalText(2000),
    external_order_no: optionalText(64),
    recipient: optionalText(200),
    recipient_phone: optionalText(64),
    recipient_city: optionalText(80),
    recipient_address: optionalText(2000),
    carrier: optionalText(120),
    notes: optionalText(2000),
  })
  .superRefine((d, ctx) => {
    const needsCustomer = d.channel === "ecza" || d.channel === "sahis";
    if (needsCustomer && d.recipient_mode === "existing" && !d.customer_id) {
      ctx.addIssue({
        code: "custom",
        path: ["customer_id"],
        message:
          d.channel === "ecza"
            ? "Ecza deposu seçin ya da yeni ekleyin."
            : "Kişi seçin ya da yeni ekleyin.",
      });
    }
    if (needsCustomer && d.recipient_mode === "new") {
      if (!d.nc_name || d.nc_name.length < 2) {
        ctx.addIssue({ code: "custom", path: ["nc_name"], message: "Ad gerekli." });
      }
      if (!d.nc_phone) {
        ctx.addIssue({ code: "custom", path: ["nc_phone"], message: "Telefon gerekli." });
      }
      if (!d.nc_city) {
        ctx.addIssue({ code: "custom", path: ["nc_city"], message: "İl gerekli." });
      }
      if (!d.nc_address) {
        ctx.addIssue({ code: "custom", path: ["nc_address"], message: "Adres gerekli." });
      }
    }
    if (
      (d.channel === "trendyol" || d.channel === "hepsiburada") &&
      !d.external_order_no
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["external_order_no"],
        message: "Pazaryeri sipariş numarası gerekli.",
      });
    }
    if (d.channel_id && d.channel !== "diger") {
      ctx.addIssue({ code: "custom", path: ["channel"], message: "Geçersiz kanal." });
    }
  });

export type ShipmentFormState = {
  error?: string;
  fieldErrors?: Partial<
    Record<keyof z.input<typeof shipmentCreateSchema>, string>
  >;
};

function emptyToNull(v: string | undefined | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

async function nextShipmentCode(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  companyId: string,
): Promise<string> {
  const { data } = await supabase
    .from("shipments")
    .select("code")
    .eq("company_id", companyId)
    .like("code", "SVK-%");

  const max = (data ?? []).reduce((current, row) => {
    const match = row.code.match(/^SVK-(\d+)$/i);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);

  return `SVK-${String(max + 1).padStart(6, "0")}`;
}

async function nextCustomerCode(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  companyId: string,
): Promise<string> {
  const { data } = await supabase
    .from("customers")
    .select("code")
    .eq("company_id", companyId)
    .like("code", "MUS-%");

  const max = (data ?? []).reduce((current, row) => {
    const match = row.code.match(/^MUS-(\d+)$/i);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);

  return `MUS-${String(max + 1).padStart(2, "0")}`;
}

const SHIPMENT_FORM_FIELDS = [
  "company_id",
  "channel",
  "channel_id",
  "recipient_mode",
  "customer_id",
  "nc_name",
  "nc_contact_name",
  "nc_phone",
  "nc_email",
  "nc_tax_office",
  "nc_tax_number",
  "nc_city",
  "nc_district",
  "nc_address",
  "external_order_no",
  "recipient",
  "recipient_phone",
  "recipient_city",
  "recipient_address",
  "carrier",
  "notes",
] as const;

type CustomerSnapshot = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
};

const CUSTOMER_SNAPSHOT_COLUMNS =
  "id, name, contact_name, phone, address, city, district";

export async function createShipment(
  _prev: ShipmentFormState,
  formData: FormData,
): Promise<ShipmentFormState> {
  const raw: Record<string, FormDataEntryValue> = Object.fromEntries(
    SHIPMENT_FORM_FIELDS.map((k) => [k, formData.get(k) ?? ""]),
  );
  if (!raw.recipient_mode) raw.recipient_mode = "existing";
  const parsed = shipmentCreateSchema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: ShipmentFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof shipmentCreateSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const d = parsed.data;
  const { ctx, companyId } = await requireCompanyRole(
    d.company_id,
    SHIPMENT_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();
  const needsCustomer = d.channel === "ecza" || d.channel === "sahis";
  const isNewCustomer = needsCustomer && d.recipient_mode === "new";

  let customer: CustomerSnapshot | null = null;

  if (isNewCustomer) {
    const customerCode = await nextCustomerCode(supabase, companyId);
    const { data: created, error: customerError } = await supabase
      .from("customers")
      .insert({
        company_id: companyId,
        code: customerCode,
        kind: d.channel === "sahis" ? "individual" : "pharma_warehouse",
        name: (d.nc_name ?? "").trim(),
        contact_name: emptyToNull(d.nc_contact_name),
        phone: emptyToNull(d.nc_phone),
        email: emptyToNull(d.nc_email),
        tax_office: emptyToNull(d.nc_tax_office),
        tax_number: emptyToNull(d.nc_tax_number),
        city: emptyToNull(d.nc_city),
        district: emptyToNull(d.nc_district),
        address: emptyToNull(d.nc_address),
        country: "TR",
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select(CUSTOMER_SNAPSHOT_COLUMNS)
      .single<CustomerSnapshot>();
    if (customerError || !created) {
      if (customerError?.code === "23505") {
        return { error: "Müşteri kodu çakıştı; lütfen tekrar deneyin." };
      }
      return { error: customerError?.message ?? "Alıcı kaydedilemedi." };
    }
    customer = created;
  } else if (needsCustomer && d.customer_id) {
    const { data: existing } = await supabase
      .from("customers")
      .select(CUSTOMER_SNAPSHOT_COLUMNS)
      .eq("id", d.customer_id)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle<CustomerSnapshot>();
    if (!existing) return { error: "Seçilen alıcı bulunamadı." };
    customer = existing;
  }

  const customerCity = customer
    ? [customer.district, customer.city].filter(Boolean).join(" / ") || null
    : null;
  const customerRecipient = customer
    ? d.channel === "sahis"
      ? customer.name
      : customer.contact_name
    : null;

  const code = await nextShipmentCode(supabase, companyId);
  const { data, error } = await supabase
    .from("shipments")
    .insert({
      company_id: companyId,
      code,
      channel: d.channel,
      channel_id: d.channel === "diger" ? d.channel_id : null,
      customer_id: customer?.id ?? null,
      external_order_no: emptyToNull(d.external_order_no),
      recipient: emptyToNull(d.recipient) ?? customerRecipient,
      recipient_phone: emptyToNull(d.recipient_phone) ?? customer?.phone ?? null,
      recipient_city: emptyToNull(d.recipient_city) ?? customerCity,
      recipient_address:
        emptyToNull(d.recipient_address) ?? customer?.address ?? null,
      carrier: emptyToNull(d.carrier),
      notes: emptyToNull(d.notes),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { error: "Kod çakışması oluştu; lütfen tekrar deneyin." };
    }
    return { error: error?.message ?? "Sipariş oluşturulamadı." };
  }

  revalidatePath(companyModulePath(companyId, "shipments"));
  if (isNewCustomer) revalidatePath(companyModulePath(companyId, "customers"));
  redirect(
    withFlash(companyModulePath(companyId, "shipments", data.id), "created"),
  );
}

export type CreateChannelResult =
  | { ok: true; channel: { id: string; name: string } }
  | { ok: false; error: string };

const BUILT_IN_CHANNEL_NAMES = [
  "ecza deposu",
  "şahıs",
  "trendyol",
  "hepsiburada",
  "diğer",
];

export async function createShipmentChannel(
  companyIdInput: string,
  nameInput: string,
): Promise<CreateChannelResult> {
  const parsed = z
    .object({
      company_id: z.string().uuid(),
      name: z
        .string()
        .trim()
        .min(2, "Kanal adı en az 2 karakter olmalı.")
        .max(80, "Kanal adı en fazla 80 karakter olabilir."),
    })
    .safeParse({ company_id: companyIdInput, name: nameInput });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Geçersiz kanal.",
    };
  }
  if (BUILT_IN_CHANNEL_NAMES.includes(parsed.data.name.toLocaleLowerCase("tr"))) {
    return { ok: false, error: "Bu kanal zaten listede var." };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    SHIPMENT_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("shipment_channels")
    .insert({
      company_id: companyId,
      name: parsed.data.name,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id, name")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { ok: false, error: "Bu isimde bir kanal zaten var." };
    }
    return { ok: false, error: error?.message ?? "Kanal eklenemedi." };
  }

  revalidatePath(companyModulePath(companyId, "shipments", "new"));
  return { ok: true, channel: data };
}

const itemAddSchema = z.object({
  company_id: z.string().uuid(),
  shipment_id: z.string().uuid(),
  lot_id: z.string().uuid({ message: "Lot seçiniz." }),
  quantity: z
    .string()
    .trim()
    .min(1, "Miktar gerekli.")
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v > 0, {
      message: "Miktar pozitif bir sayı olmalı.",
    }),
});

export type ShipmentItemFormState = {
  error?: string;
};

export async function addShipmentItem(
  _prev: ShipmentItemFormState,
  formData: FormData,
): Promise<ShipmentItemFormState> {
  const parsed = itemAddSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    shipment_id: formData.get("shipment_id") ?? "",
    lot_id: formData.get("lot_id") ?? "",
    quantity: formData.get("quantity") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz kalem." };
  }

  const { ctx, companyId, role } = await requireCompanyRole(
    parsed.data.company_id,
    SHIPMENT_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: lot } = await supabase
    .from("material_lots")
    .select(
      "id, material_id, status, quantity_on_hand, materials:material_id(type)",
    )
    .eq("id", parsed.data.lot_id)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      material_id: string;
      status: string;
      quantity_on_hand: number;
      materials: { type: string } | null;
    }>();

  if (!lot) return { error: "Lot bulunamadı." };
  if (role === "operator" && lot.materials?.type !== "finished") {
    return { error: "Depo personeli yalnızca bitmiş ürün sevk edebilir." };
  }
  if (lot.status !== "released") {
    return { error: "Yalnızca 'Serbest' lotlar sevk edilebilir." };
  }
  if (Number(lot.quantity_on_hand) < parsed.data.quantity) {
    return {
      error: `Lotta yeterli stok yok (eldeki: ${Number(lot.quantity_on_hand).toLocaleString("tr-TR")}).`,
    };
  }

  const { error } = await supabase.from("shipment_items").insert({
    company_id: companyId,
    shipment_id: parsed.data.shipment_id,
    lot_id: lot.id,
    material_id: lot.material_id,
    quantity: parsed.data.quantity,
    created_by: ctx.userId,
  });

  if (error) return { error: error.message };

  await supabase
    .from("shipments")
    .update({ status: "preparing", updated_by: ctx.userId })
    .eq("id", parsed.data.shipment_id)
    .eq("company_id", companyId)
    .eq("status", "open");

  revalidatePath(
    companyModulePath(companyId, "shipments", parsed.data.shipment_id),
  );
  return {};
}

export async function removeShipmentItem(
  companyId: string,
  shipmentId: string,
  itemId: string,
): Promise<void> {
  await requireCompanyRole(companyId, SHIPMENT_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  await supabase
    .from("shipment_items")
    .delete()
    .eq("id", itemId)
    .eq("company_id", companyId)
    .eq("shipment_id", shipmentId);

  revalidatePath(companyModulePath(companyId, "shipments", shipmentId));
}

export type ShipActionState = {
  error?: string;
};

export async function shipShipment(
  _prev: ShipActionState,
  formData: FormData,
): Promise<ShipActionState> {
  const companyIdInput = String(formData.get("company_id") ?? "");
  const shipmentId = String(formData.get("shipment_id") ?? "");

  const { companyId } = await requireCompanyRole(
    companyIdInput,
    SHIPMENT_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("ship_shipment", {
    p_company_id: companyId,
    p_shipment_id: shipmentId,
  });

  if (error) {
    if (error.message.includes("no items")) {
      return { error: "Göndermeden önce en az bir kalem ekleyin." };
    }
    if (error.message.includes("insufficient stock")) {
      return { error: "Bir kalemde yeterli stok kalmadı; miktarları kontrol edin." };
    }
    if (error.message.includes("not released")) {
      return { error: "Bir kalemdeki lot artık 'Serbest' değil." };
    }
    return { error: error.message };
  }

  revalidatePath(companyModulePath(companyId, "shipments"));
  revalidatePath(companyModulePath(companyId, "lots"));
  revalidatePath(companyModulePath(companyId, "warehouse"));
  redirect(
    withFlash(companyModulePath(companyId, "shipments", shipmentId), "shipped"),
  );
}

export async function cancelShipment(
  companyId: string,
  shipmentId: string,
): Promise<void> {
  const { ctx } = await requireCompanyRole(companyId, SHIPMENT_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("shipments")
    .update({ status: "cancelled", updated_by: ctx.userId })
    .eq("id", shipmentId)
    .eq("company_id", companyId)
    .in("status", ["open", "preparing"]);

  if (error) throw new Error(error.message);

  revalidatePath(companyModulePath(companyId, "shipments"));
  redirect(withFlash(companyModulePath(companyId, "shipments"), "updated"));
}

export type MarketplaceOrderActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

// Depocu "Tekrar Dene": sayım bitti / barkod eşlendi, otomatik düşümü hemen çalıştır.
export async function retryMarketplaceAutoShip(
  companyIdInput: string,
  orderNumberInput: string,
): Promise<MarketplaceOrderActionResult> {
  const parsed = z
    .object({ company_id: z.string().uuid(), order_number: z.string().min(1).max(64) })
    .safeParse({ company_id: companyIdInput, order_number: orderNumberInput });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const { companyId } = await requireCompanyRole(
    parsed.data.company_id,
    SHIPMENT_WRITE_ROLES,
  );

  const outcome = await autoShipOne(companyId, "trendyol", parsed.data.order_number);
  revalidatePath(companyModulePath(companyId, "shipments"));
  revalidatePath(companyModulePath(companyId, "stock"));
  revalidatePath(companyModulePath(companyId));

  if (outcome === "shipped") return { ok: true, message: "Sevkiyat açıldı ve stoktan düşüldü." };
  if (outcome === "manual") return { ok: true, message: "Elle açılmış sevkiyata bağlandı." };
  if (outcome === "already") return { ok: true, message: "Bu sipariş zaten düşülmüş." };

  const service = createServiceRoleClient();
  const { data } = await service
    .from("marketplace_orders")
    .select("auto_ship_error")
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .eq("order_number", parsed.data.order_number)
    .maybeSingle();
  return { ok: false, error: data?.auto_ship_error ?? "Düşülemedi." };
}

// İade / iptal: düşülmüş sevkiyatın çıkışlarını storno ile depoya geri alır.
export async function returnMarketplaceOrderToStock(
  companyIdInput: string,
  orderNumberInput: string,
): Promise<MarketplaceOrderActionResult> {
  const parsed = z
    .object({ company_id: z.string().uuid(), order_number: z.string().min(1).max(64) })
    .safeParse({ company_id: companyIdInput, order_number: orderNumberInput });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const { companyId } = await requireCompanyRole(
    parsed.data.company_id,
    SHIPMENT_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: order } = await supabase
    .from("marketplace_orders")
    .select("id, shipment_id, auto_ship_status, status")
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .eq("order_number", parsed.data.order_number)
    .maybeSingle();

  if (!order?.shipment_id) return { ok: false, error: "Bu siparişe bağlı sevkiyat yok." };
  if (order.auto_ship_status === "returned") {
    return { ok: false, error: "Bu sipariş zaten depoya geri alınmış." };
  }

  const { data: count, error } = await supabase.rpc("return_shipment_to_stock", {
    p_company_id: companyId,
    p_shipment_id: order.shipment_id,
    p_reason: `Trendyol ${parsed.data.order_number} iade/iptal – depoya geri alındı`,
  });
  if (error) return { ok: false, error: error.message };

  await supabase
    .from("marketplace_orders")
    .update({ auto_ship_status: "returned", auto_ship_at: new Date().toISOString() })
    .eq("id", order.id);

  revalidatePath(companyModulePath(companyId, "shipments"));
  revalidatePath(companyModulePath(companyId, "stock"));
  revalidatePath(companyModulePath(companyId));
  return { ok: true, message: `${count ?? 0} lot hareketi geri alındı; ürün tekrar stokta.` };
}
