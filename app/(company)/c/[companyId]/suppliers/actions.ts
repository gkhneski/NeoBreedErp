"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { withFlash } from "@/lib/flash";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES, companyModulePath } from "@/types/roles";

const supplierSchema = z.object({
  company_id: z.string().uuid(),
  supplier_id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(2, "Ad en az 2 karakter olmalı.").max(200),
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
  fieldErrors?: Partial<Record<keyof z.input<typeof supplierSchema>, string>>;
};

function emptyToNull(v: string | undefined | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function parseSupplierForm(formData: FormData) {
  return supplierSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    supplier_id: formData.get("supplier_id") ?? "",
    name: formData.get("name") ?? "",
    tax_number: formData.get("tax_number") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    address: formData.get("address") ?? "",
    country: formData.get("country") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

function fieldErrorsFrom(
  issues: z.ZodIssue[],
): SupplierFormState["fieldErrors"] {
  const fieldErrors: SupplierFormState["fieldErrors"] = {};
  for (const issue of issues) {
    const key = issue.path[0] as keyof z.input<typeof supplierSchema>;
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

async function nextSupplierCode(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  companyId: string,
) {
  const { data } = await supabase
    .from("suppliers")
    .select("code")
    .eq("company_id", companyId)
    .like("code", "TED-%");

  const max = (data ?? []).reduce((current, row) => {
    const match = row.code.match(/^TED-(\d+)$/i);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);

  return `TED-${String(max + 1).padStart(2, "0")}`;
}

export async function createSupplier(
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const parsed = parseSupplierForm(formData);

  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      error: "Form alanlarını kontrol edin.",
    };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();
  const code = await nextSupplierCode(supabase, companyId);

  const { error } = await supabase.from("suppliers").insert({
    company_id: companyId,
    code,
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
      return { error: "Otomatik kod oluşturulamadı; lütfen tekrar deneyin." };
    }
    return { error: error.message };
  }

  revalidatePath(companyModulePath(companyId, "suppliers"));
  redirect(withFlash(companyModulePath(companyId, "suppliers"), "created"));
}

export async function updateSupplier(
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const parsed = parseSupplierForm(formData);

  if (!parsed.success || !parsed.data.supplier_id) {
    return {
      fieldErrors: parsed.success
        ? {}
        : fieldErrorsFrom(parsed.error.issues),
      error: "Form alanlarını kontrol edin.",
    };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("suppliers")
    .update({
      name: parsed.data.name,
      tax_number: emptyToNull(parsed.data.tax_number),
      email: emptyToNull(parsed.data.email),
      phone: emptyToNull(parsed.data.phone),
      address: emptyToNull(parsed.data.address),
      country: parsed.data.country ? parsed.data.country.toUpperCase() : null,
      notes: emptyToNull(parsed.data.notes),
      updated_by: ctx.userId,
    })
    .eq("id", parsed.data.supplier_id)
    .eq("company_id", companyId);

  if (error) return { error: error.message };

  revalidatePath(companyModulePath(companyId, "suppliers"));
  redirect(withFlash(companyModulePath(companyId, "suppliers"), "updated"));
}

export async function deleteSupplier(
  companyId: string,
  supplierId: string,
): Promise<void> {
  const { ctx } = await requireCompanyRole(companyId, MASTER_DATA_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("suppliers")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", supplierId)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath(companyModulePath(companyId, "suppliers"));
  revalidatePath(companyModulePath(companyId, "materials"));
  redirect(withFlash(companyModulePath(companyId, "suppliers"), "deleted"));
}
