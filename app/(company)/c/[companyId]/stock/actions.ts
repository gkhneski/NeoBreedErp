"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STOCK_WRITE_ROLES, companyModulePath } from "@/types/roles";

const movementSchema = z
  .object({
    company_id: z.string().uuid(),
    lot_id: z.string().uuid({ message: "Lot seçiniz." }),
    kind: z.enum(["issue", "adjustment"], {
      message: "Hareket türü seçiniz.",
    }),
    quantity: z
      .string()
      .trim()
      .min(1, "Miktar gerekli.")
      .transform((v) => Number(v))
      .refine((v) => Number.isFinite(v) && v !== 0, {
        message: "Miktar 0 olamaz.",
      }),
    direction: z.enum(["in", "out"]).optional(),
    reason: z.string().trim().max(500).optional().or(z.literal("")),
    occurred_at: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null))
      .refine(
        (v) => v === null || !Number.isNaN(Date.parse(v)),
        "Geçerli bir tarih/saat giriniz.",
      ),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .superRefine((d, ctx) => {
    if (d.kind === "adjustment" && (!d.reason || d.reason.length === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Sayım düzeltmesi için sebep zorunlu.",
      });
    }
    if (d.kind === "adjustment" && !d.direction) {
      ctx.addIssue({
        code: "custom",
        path: ["direction"],
        message: "Yön seçiniz.",
      });
    }
  });

export type StockMovementFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.input<typeof movementSchema>, string>>;
};

function emptyToNull(v: string | undefined | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function recordStockMovement(
  _prev: StockMovementFormState,
  formData: FormData,
): Promise<StockMovementFormState> {
  const parsed = movementSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    lot_id: formData.get("lot_id") ?? "",
    kind: formData.get("kind") ?? "",
    quantity: formData.get("quantity") ?? "",
    direction: formData.get("direction") ?? "",
    reason: formData.get("reason") ?? "",
    occurred_at: formData.get("occurred_at") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: StockMovementFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof movementSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    STOCK_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: lot, error: lotErr } = await supabase
    .from("material_lots")
    .select("id, material_id, company_id, quantity_on_hand, status")
    .eq("id", parsed.data.lot_id)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();

  if (lotErr || !lot) {
    return { error: "Lot bulunamadı veya bu firmaya ait değil." };
  }

  const absQty = Math.abs(parsed.data.quantity);
  let signedQty: number;
  if (parsed.data.kind === "issue") {
    signedQty = -absQty;
  } else {
    signedQty = parsed.data.direction === "in" ? absQty : -absQty;
  }

  if (parsed.data.kind === "issue" && lot.status !== "released") {
    return {
      error:
        "Sadece 'released' (serbest) durumdaki lotlardan çıkış yapılabilir. Önce QC sonrası lot durumunu güncelleyin.",
    };
  }

  const { error } = await supabase.from("stock_movements").insert({
    company_id: companyId,
    material_id: lot.material_id,
    lot_id: lot.id,
    kind: parsed.data.kind,
    quantity: signedQty,
    reason: emptyToNull(parsed.data.reason),
    occurred_at: parsed.data.occurred_at ?? new Date().toISOString(),
    notes: emptyToNull(parsed.data.notes),
    created_by: ctx.userId,
  });

  if (error) {
    if (error.code === "23514") {
      if (/below zero/i.test(error.message)) {
        return {
          error: "Mevcut stok yetersiz; lot negatife düşemez.",
          fieldErrors: { quantity: "Miktar lot stoğundan büyük." },
        };
      }
      return { error: error.message };
    }
    return { error: error.message };
  }

  revalidatePath(companyModulePath(companyId, "stock"));
  revalidatePath(companyModulePath(companyId, "lots"));
  redirect(companyModulePath(companyId, "stock"));
}
