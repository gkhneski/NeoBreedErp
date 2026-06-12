"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { withFlash } from "@/lib/flash";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES, companyModulePath } from "@/types/roles";

const customerSchema = z.object({
  company_id: z.string().uuid(),
  customer_id: z.string().uuid().optional().or(z.literal("")),
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

export type CustomerFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.input<typeof customerSchema>, string>>;
};

function emptyToNull(v: string | undefined | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function parseCustomerForm(formData: FormData) {
  return customerSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    customer_id: formData.get("customer_id") ?? "",
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
): CustomerFormState["fieldErrors"] {
  const fieldErrors: CustomerFormState["fieldErrors"] = {};
  for (const issue of issues) {
    const key = issue.path[0] as keyof z.input<typeof customerSchema>;
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

async function nextCustomerCode(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  companyId: string,
) {
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

export async function createCustomer(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const parsed = parseCustomerForm(formData);

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
  const code = await nextCustomerCode(supabase, companyId);

  const { error } = await supabase.from("customers").insert({
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

  revalidatePath(companyModulePath(companyId, "customers"));
  redirect(withFlash(companyModulePath(companyId, "customers"), "created"));
}

export async function updateCustomer(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const parsed = parseCustomerForm(formData);

  if (!parsed.success || !parsed.data.customer_id) {
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
    .from("customers")
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
    .eq("id", parsed.data.customer_id)
    .eq("company_id", companyId);

  if (error) return { error: error.message };

  revalidatePath(companyModulePath(companyId, "customers"));
  redirect(withFlash(companyModulePath(companyId, "customers"), "updated"));
}

export async function deleteCustomer(
  companyId: string,
  customerId: string,
): Promise<void> {
  const { ctx } = await requireCompanyRole(companyId, MASTER_DATA_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("customers")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", customerId)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath(companyModulePath(companyId, "customers"));
  revalidatePath(companyModulePath(companyId, "production"));
  redirect(withFlash(companyModulePath(companyId, "customers"), "deleted"));
}
