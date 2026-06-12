"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { withFlash } from "@/lib/flash";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES, companyModulePath } from "@/types/roles";

const daysField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} gerekli.`)
    .transform((v) => Number(v))
    .refine((v) => Number.isInteger(v) && v >= 1 && v <= 3650, {
      message: `${label} 1 ile 3650 gün arasında olmalı.`,
    });

const expirySettingsSchema = z
  .object({
    company_id: z.string().uuid(),
    expiry_critical_days: daysField("Acil eşiği"),
    expiry_warning_days: daysField("Yaklaşan eşiği"),
  })
  .refine((d) => d.expiry_critical_days < d.expiry_warning_days, {
    message: "Acil eşiği, yaklaşan eşiğinden küçük olmalı.",
    path: ["expiry_critical_days"],
  });

export type ExpirySettingsState = {
  error?: string;
  fieldErrors?: Partial<
    Record<keyof z.input<typeof expirySettingsSchema>, string>
  >;
};

export async function saveExpirySettings(
  _prev: ExpirySettingsState,
  formData: FormData,
): Promise<ExpirySettingsState> {
  const parsed = expirySettingsSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    expiry_critical_days: formData.get("expiry_critical_days") ?? "",
    expiry_warning_days: formData.get("expiry_warning_days") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: ExpirySettingsState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof expirySettingsSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.from("company_settings").upsert(
    {
      company_id: companyId,
      expiry_critical_days: parsed.data.expiry_critical_days,
      expiry_warning_days: parsed.data.expiry_warning_days,
      updated_by: ctx.userId,
    },
    { onConflict: "company_id" },
  );

  if (error) {
    return { error: error.message };
  }

  revalidatePath(companyModulePath(companyId, "settings", "expiry"));
  revalidatePath(companyModulePath(companyId, "lots"));
  revalidatePath(companyModulePath(companyId));
  redirect(
    withFlash(companyModulePath(companyId, "settings", "expiry"), "updated"),
  );
}
