"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES, companyModulePath } from "@/types/roles";

const supplierCreateSchema = z.object({
  company_id: z.string().uuid(),
  code: z
    .string()
    .trim()
    .min(1, "Kod boş bırakılamaz.")
    .max(64, "Kod en fazla 64 karakter olabilir.")
    .regex(
      /^[A-Za-z0-9._-]+$/,
      "Kod yalnızca harf, rakam, nokta, alt çizgi ve tire içerebilir.",
    ),
  name: z
    .string()
    .trim()
    .min(2, "Ad en az 2 karakter olmalı.")
    .max(200, "Ad en fazla 200 karakter olabilir."),
  tax_number: z.string().trim().max(64).optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Geçerli bir e-posta giriniz.",
    ),
  phone: z.string().trim().max(64).optional().or(z.literal("")),
  address: z.string().trim().max(2000).optional().or(z.literal("")),
  country: z
    .string()
    .trim()
    .max(2)
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || /^[A-Za-z]{2}$/.test(v),
      "Ülke kodu ISO 3166-1 alpha-2 olmalı (örn. TR, DE).",
    ),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type SupplierFormState = {
  error?: string;
  fieldErrors?: Partial<
    Record<keyof z.input<typeof supplierCreateSchema>, string>
  >;
};

function emptyToNull(v: string | undefined | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function createSupplier(
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const parsed = supplierCreateSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    code: formData.get("code") ?? "",
    name: formData.get("name") ?? "",
    tax_number: formData.get("tax_number") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    address: formData.get("address") ?? "",
    country: formData.get("country") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: SupplierFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof supplierCreateSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.from("suppliers").insert({
    company_id: companyId,
    code: parsed.data.code,
    name: parsed.data.name,
    tax_number: emptyToNull(parsed.data.tax_number),
    email: emptyToNull(parsed.data.email),
    phone: emptyToNull(parsed.data.phone),
    address: emptyToNull(parsed.data.address),
    country: parsed.data.country ? parsed.data.country.toUpperCase() : null,
    notes: emptyToNull(parsed.data.notes),
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        error: "Bu kod ile bir tedarikçi zaten kayıtlı.",
        fieldErrors: { code: "Kod benzersiz olmalı." },
      };
    }
    return { error: error.message };
  }

  revalidatePath(companyModulePath(companyId, "suppliers"));
  redirect(companyModulePath(companyId, "suppliers"));
}
