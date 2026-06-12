"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { withFlash } from "@/lib/flash";
import {
  isSupportedCurrency,
  normalizeSupportedCurrency,
} from "@/lib/currencies";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STOCK_WRITE_ROLES, companyModulePath } from "@/types/roles";

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

const purchaseReceiptSchema = z
  .object({
    company_id: z.string().uuid(),
    receipt_mode: z.enum(["new_lot", "existing_lot"]),
    material_id: optionalUuid,
    lot_id: optionalUuid,
    supplier_id: optionalUuid,
    lot_number: z.string().trim().max(64).optional().or(z.literal("")),
    invoice_number: z.string().trim().max(80).optional().or(z.literal("")),
    dispatch_note_number: z
      .string()
      .trim()
      .max(80)
      .optional()
      .or(z.literal("")),
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
      .transform((v) => (v ? v.toUpperCase() : ""))
      .refine(
        (v) => !v || isSupportedCurrency(v),
        "Para birimi TRY, USD veya EUR olmalı.",
      ),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .superRefine((d, ctx) => {
    if (!d.invoice_number && !d.dispatch_note_number) {
      ctx.addIssue({
        code: "custom",
        path: ["invoice_number"],
        message: "Fatura no veya irsaliye no alanlarindan en az biri gerekli.",
      });
    }
    if (d.receipt_mode === "new_lot") {
      if (!d.material_id) {
        ctx.addIssue({
          code: "custom",
          path: ["material_id"],
          message: "Malzeme seçiniz.",
        });
      }
      if (!d.lot_number || d.lot_number.trim().length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["lot_number"],
          message: "Yeni alım için lot numarası gerekli.",
        });
      }
    }
    if (d.receipt_mode === "existing_lot" && !d.lot_id) {
      ctx.addIssue({
        code: "custom",
        path: ["lot_id"],
        message: "Mevcut lot seçiniz.",
      });
    }
    if (d.expiry_date && d.received_at && d.expiry_date < d.received_at) {
      ctx.addIssue({
        code: "custom",
        path: ["expiry_date"],
        message: "Son kullanma alış tarihinden önce olamaz.",
      });
    }
  });

export type PurchaseReceiptFormState = {
  error?: string;
  fieldErrors?: Partial<
    Record<keyof z.input<typeof purchaseReceiptSchema>, string>
  >;
};

function emptyToNull(v: string | undefined | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function buildReceiptNotes(data: z.output<typeof purchaseReceiptSchema>) {
  const parts = [
    data.invoice_number ? `Fatura No: ${data.invoice_number}` : null,
    data.dispatch_note_number
      ? `İrsaliye No: ${data.dispatch_note_number}`
      : null,
    data.notes ? `Not: ${data.notes}` : null,
  ].filter(Boolean);
  return parts.join("\n");
}

export async function recordPurchaseReceipt(
  _prev: PurchaseReceiptFormState,
  formData: FormData,
): Promise<PurchaseReceiptFormState> {
  const parsed = purchaseReceiptSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    receipt_mode: formData.get("receipt_mode") ?? "",
    material_id: formData.get("material_id") ?? "",
    lot_id: formData.get("lot_id") ?? "",
    supplier_id: formData.get("supplier_id") ?? "",
    lot_number: formData.get("lot_number") ?? "",
    invoice_number: formData.get("invoice_number") ?? "",
    dispatch_note_number: formData.get("dispatch_note_number") ?? "",
    received_at: formData.get("received_at") ?? "",
    expiry_date: formData.get("expiry_date") ?? "",
    quantity: formData.get("quantity") ?? "",
    unit_cost: formData.get("unit_cost") ?? "",
    currency: formData.get("currency") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: PurchaseReceiptFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof purchaseReceiptSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    STOCK_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();
  const receiptNotes = buildReceiptNotes(parsed.data);
  const currency = normalizeSupportedCurrency(parsed.data.currency);

  if (parsed.data.receipt_mode === "new_lot") {
    const materialId = parsed.data.material_id;
    const lotNumber = parsed.data.lot_number?.trim();
    if (!materialId || !lotNumber) {
      return { error: "Malzeme ve lot numarası gerekli." };
    }

    const { error } = await supabase.rpc("create_lot_with_receipt", {
      p_company_id: companyId,
      p_material_id: materialId,
      p_supplier_id: parsed.data.supplier_id,
      p_lot_number: lotNumber,
      p_received_at: parsed.data.received_at,
      p_expiry_date: parsed.data.expiry_date,
      p_unit_cost: parsed.data.unit_cost,
      p_currency: currency,
      p_quantity: parsed.data.quantity,
      p_notes: emptyToNull(parsed.data.notes),
      p_movement_notes: receiptNotes || null,
    });

    if (error) {
      if (error.code === "23505") {
        return {
          error: "Bu malzeme için aynı lot numarası zaten kayıtlı.",
          fieldErrors: { lot_number: "Lot numarası benzersiz olmalı." },
        };
      }
      if (error.code === "23503") {
        return { error: "Seçilen malzeme veya tedarikçi bulunamadı." };
      }
      return { error: error.message };
    }
  } else {
    const lotId = parsed.data.lot_id;
    if (!lotId) {
      return { error: "Mevcut lot seçiniz." };
    }

    const { data: lot, error: lotErr } = await supabase
      .from("material_lots")
      .select("id, material_id, company_id")
      .eq("id", lotId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle();

    if (lotErr || !lot) {
      return { error: "Mevcut lot bulunamadı veya bu firmaya ait değil." };
    }

    const { error } = await supabase.from("stock_movements").insert({
      company_id: companyId,
      material_id: lot.material_id,
      lot_id: lot.id,
      kind: "receipt",
      quantity: parsed.data.quantity,
      unit_cost: parsed.data.unit_cost,
      occurred_at: parsed.data.received_at
        ? `${parsed.data.received_at}T00:00:00.000Z`
        : new Date().toISOString(),
      notes: receiptNotes || null,
      created_by: ctx.userId,
    });

    if (error) return { error: error.message };
  }

  revalidatePath(companyModulePath(companyId, "purchases"));
  revalidatePath(companyModulePath(companyId, "lots"));
  revalidatePath(companyModulePath(companyId, "stock"));
  redirect(withFlash(companyModulePath(companyId, "purchases"), "created"));
}
