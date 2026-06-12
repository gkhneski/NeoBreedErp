"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { withFlash } from "@/lib/flash";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SHIPMENT_WRITE_ROLES, companyModulePath } from "@/types/roles";

const shipmentCreateSchema = z
  .object({
    company_id: z.string().uuid(),
    channel: z.enum(["ecza", "trendyol", "hepsiburada", "diger"], {
      message: "Kanal seçiniz.",
    }),
    customer_id: z
      .string()
      .uuid()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : null)),
    external_order_no: z.string().trim().max(64).optional().or(z.literal("")),
    recipient: z.string().trim().max(200).optional().or(z.literal("")),
    carrier: z.string().trim().max(120).optional().or(z.literal("")),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .refine((d) => d.channel !== "ecza" || d.customer_id !== null, {
    message: "Ecza deposu kanalında müşteri seçilmeli.",
    path: ["customer_id"],
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

export async function createShipment(
  _prev: ShipmentFormState,
  formData: FormData,
): Promise<ShipmentFormState> {
  const parsed = shipmentCreateSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    channel: formData.get("channel") ?? "",
    customer_id: formData.get("customer_id") ?? "",
    external_order_no: formData.get("external_order_no") ?? "",
    recipient: formData.get("recipient") ?? "",
    carrier: formData.get("carrier") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: ShipmentFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof shipmentCreateSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    SHIPMENT_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();
  const code = await nextShipmentCode(supabase, companyId);

  const { data, error } = await supabase
    .from("shipments")
    .insert({
      company_id: companyId,
      code,
      channel: parsed.data.channel,
      customer_id: parsed.data.customer_id,
      external_order_no: emptyToNull(parsed.data.external_order_no),
      recipient: emptyToNull(parsed.data.recipient),
      carrier: emptyToNull(parsed.data.carrier),
      notes: emptyToNull(parsed.data.notes),
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
  redirect(
    withFlash(companyModulePath(companyId, "shipments", data.id), "created"),
  );
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

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    SHIPMENT_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: lot } = await supabase
    .from("material_lots")
    .select("id, material_id, status, quantity_on_hand")
    .eq("id", parsed.data.lot_id)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!lot) return { error: "Lot bulunamadı." };
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
