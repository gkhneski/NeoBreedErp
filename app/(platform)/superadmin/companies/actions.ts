"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/auth";
import { withFlash } from "@/lib/flash";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const companyCreateSchema = z.object({
  name: z.string().trim().min(2, "Firma adı en az 2 karakter olmalı."),
  tax_number: z
    .string()
    .trim()
    .max(20, "Vergi numarası en fazla 20 karakter olabilir.")
    .optional()
    .or(z.literal("")),
  contact_name: z.string().trim().optional().or(z.literal("")),
  contact_email: z
    .string()
    .trim()
    .email("Geçerli bir e-posta adresi girin.")
    .optional()
    .or(z.literal("")),
  contact_phone: z.string().trim().optional().or(z.literal("")),
  address: z.string().trim().optional().or(z.literal("")),
  package_id: z.string().trim().optional().or(z.literal("")),
  status: z.enum(["active", "suspended", "archived"]).default("active"),
});

export type CompanyFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof companyCreateSchema>, string>>;
};

function emptyToNull(v: string | undefined | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function createCompany(
  _prev: CompanyFormState,
  formData: FormData,
): Promise<CompanyFormState> {
  const ctx = await requirePlatformAdmin();

  const parsed = companyCreateSchema.safeParse({
    name: formData.get("name") ?? "",
    tax_number: formData.get("tax_number") ?? "",
    contact_name: formData.get("contact_name") ?? "",
    contact_email: formData.get("contact_email") ?? "",
    contact_phone: formData.get("contact_phone") ?? "",
    address: formData.get("address") ?? "",
    package_id: formData.get("package_id") ?? "",
    status: (formData.get("status") as string) || "active",
  });

  if (!parsed.success) {
    const fieldErrors: CompanyFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof companyCreateSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("companies")
    .insert({
      name: parsed.data.name,
      tax_number: emptyToNull(parsed.data.tax_number),
      contact_name: emptyToNull(parsed.data.contact_name),
      contact_email: emptyToNull(parsed.data.contact_email),
      contact_phone: emptyToNull(parsed.data.contact_phone),
      address: emptyToNull(parsed.data.address),
      package_id: emptyToNull(parsed.data.package_id),
      status: parsed.data.status,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Firma oluşturulamadı." };
  }

  const { error: auditError } = await supabase.from("platform_audit_log").insert({
    actor_id: ctx.userId,
    action: "create_company",
    target_table: "companies",
    target_id: data.id,
    diff: { name: parsed.data.name, status: parsed.data.status },
  });
  if (auditError) {
    console.error("[audit] create_company failed", {
      target_id: data.id,
      message: auditError.message,
    });
    return { error: "Firma oluşturuldu fakat denetim kaydı yazılamadı. Bir yöneticiye bildirin." };
  }

  revalidatePath("/superadmin");
  revalidatePath("/superadmin/companies");
  redirect(withFlash(`/superadmin/companies/${data.id}`, "created"));
}

export async function setCompanyStatus(
  companyId: string,
  status: "active" | "suspended" | "archived",
): Promise<void> {
  const ctx = await requirePlatformAdmin();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("companies")
    .update({ status, updated_by: ctx.userId })
    .eq("id", companyId);

  if (error) {
    throw new Error(error.message);
  }

  const { error: auditError } = await supabase.from("platform_audit_log").insert({
    actor_id: ctx.userId,
    action: `set_status_${status}`,
    target_table: "companies",
    target_id: companyId,
    diff: { status },
  });
  if (auditError) {
    console.error("[audit] set_company_status failed", {
      target_id: companyId,
      status,
      message: auditError.message,
    });
    throw new Error("Durum güncellendi fakat denetim kaydı yazılamadı.");
  }

  revalidatePath("/superadmin");
  revalidatePath("/superadmin/companies");
  revalidatePath(`/superadmin/companies/${companyId}`);
}
