"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  QUALITY_WRITE_ROLES,
  STOCK_WRITE_ROLES,
  companyModulePath,
} from "@/types/roles";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || uuidRegex.test(v), {
    message: "Geçersiz seçim.",
  });

const dateOptional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), {
    message: "Tarih formatı yyyy-aa-gg olmalı.",
  });

const lotCreateSchema = z
  .object({
    company_id: z.string().uuid(),
    material_id: z.string().uuid({ message: "Malzeme seçiniz." }),
    supplier_id: optionalUuid,
    lot_number: z
      .string()
      .trim()
      .min(1, "Lot numarası boş olamaz.")
      .max(64, "Lot numarası en fazla 64 karakter olabilir.")
      .regex(
        /^[A-Za-z0-9._\-/]+$/,
        "Lot numarası yalnızca harf, rakam, nokta, tire, alt çizgi ve eğik çizgi içerebilir.",
      ),
    received_at: dateOptional,
    expiry_date: dateOptional,
    quantity: z
      .string()
      .trim()
      .min(1, "Miktar gerekli.")
      .transform((v) => Number(v))
      .refine((v) => Number.isFinite(v) && v > 0, {
        message: "Miktar pozitif bir sayı olmalı.",
      }),
    unit_cost: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? Number(v) : null))
      .refine((v) => v === null || (Number.isFinite(v) && v >= 0), {
        message: "Birim maliyet 0 veya pozitif olmalı.",
      }),
    currency: z
      .string()
      .trim()
      .max(3)
      .optional()
      .or(z.literal(""))
      .refine(
        (v) => !v || /^[A-Za-z]{3}$/.test(v),
        "Para birimi ISO 4217 (örn. TRY, EUR) olmalı.",
      ),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .refine(
    (d) => !d.expiry_date || !d.received_at || d.expiry_date >= d.received_at,
    { message: "Son kullanma alış tarihinden önce olamaz.", path: ["expiry_date"] },
  );

export type LotFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.input<typeof lotCreateSchema>, string>>;
};

function emptyToNull(v: string | undefined | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function createLot(
  _prev: LotFormState,
  formData: FormData,
): Promise<LotFormState> {
  const parsed = lotCreateSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    material_id: formData.get("material_id") ?? "",
    supplier_id: formData.get("supplier_id") ?? "",
    lot_number: formData.get("lot_number") ?? "",
    received_at: formData.get("received_at") ?? "",
    expiry_date: formData.get("expiry_date") ?? "",
    quantity: formData.get("quantity") ?? "",
    unit_cost: formData.get("unit_cost") ?? "",
    currency: formData.get("currency") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: LotFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof lotCreateSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const { companyId } = await requireCompanyRole(
    parsed.data.company_id,
    STOCK_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("create_lot_with_receipt", {
    p_company_id: companyId,
    p_material_id: parsed.data.material_id,
    p_supplier_id: parsed.data.supplier_id,
    p_lot_number: parsed.data.lot_number,
    p_received_at: parsed.data.received_at,
    p_expiry_date: parsed.data.expiry_date,
    p_unit_cost: parsed.data.unit_cost,
    p_currency: parsed.data.currency
      ? parsed.data.currency.toUpperCase()
      : null,
    p_quantity: parsed.data.quantity,
    p_notes: emptyToNull(parsed.data.notes),
    p_movement_notes: null,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        error: "Bu malzeme için aynı lot numarası zaten kayıtlı.",
        fieldErrors: { lot_number: "Lot numarası benzersiz olmalı." },
      };
    }
    if (error.code === "23514") {
      return { error: error.message };
    }
    if (error.code === "23503") {
      return { error: "Seçilen malzeme veya tedarikçi bulunamadı." };
    }
    return { error: error.message };
  }

  revalidatePath(companyModulePath(companyId, "lots"));
  revalidatePath(companyModulePath(companyId, "stock"));
  redirect(companyModulePath(companyId, "lots"));
}

const lotStatusSchema = z.object({
  company_id: z.string().uuid(),
  lot_id: z.string().uuid(),
  status: z.enum(["quarantine", "released", "blocked"]),
});

export async function updateLotStatus(formData: FormData): Promise<void> {
  const parsed = lotStatusSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    lot_id: formData.get("lot_id") ?? "",
    status: formData.get("status") ?? "",
  });
  if (!parsed.success) return;

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    QUALITY_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  await supabase
    .from("material_lots")
    .update({ status: parsed.data.status, updated_by: ctx.userId })
    .eq("id", parsed.data.lot_id)
    .eq("company_id", companyId);

  revalidatePath(companyModulePath(companyId, "lots"));
}
