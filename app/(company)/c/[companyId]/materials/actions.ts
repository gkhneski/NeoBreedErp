"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

const ALLOWED_UOM = ["g", "kg", "mg", "mL", "L", "unit"] as const;

const materialCreateSchema = z.object({
  company_id: z.string().uuid(),
  code: z
    .string()
    .trim()
    .min(1, "Kod boş bırakılamaz.")
    .max(64, "Kod en fazla 64 karakter olabilir.")
    .regex(/^[A-Za-z0-9._-]+$/, "Kod yalnızca harf, rakam, nokta, alt çizgi ve tire içerebilir."),
  name: z
    .string()
    .trim()
    .min(2, "Ad en az 2 karakter olmalı.")
    .max(200, "Ad en fazla 200 karakter olabilir."),
  type: z.enum(["raw", "finished"], {
    message: "Tip seçiniz.",
  }),
  base_uom: z.enum(ALLOWED_UOM, {
    message: "Geçerli bir birim seçiniz.",
  }),
  density: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v > 0), {
      message: "Yoğunluk pozitif bir sayı olmalı.",
    }),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type MaterialFormState = {
  error?: string;
  fieldErrors?: Partial<
    Record<keyof z.input<typeof materialCreateSchema>, string>
  >;
};

function emptyToNull(v: string | undefined | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function createMaterial(
  _prev: MaterialFormState,
  formData: FormData,
): Promise<MaterialFormState> {
  const parsed = materialCreateSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    code: formData.get("code") ?? "",
    name: formData.get("name") ?? "",
    type: formData.get("type") ?? "",
    base_uom: formData.get("base_uom") ?? "",
    density: formData.get("density") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: MaterialFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof materialCreateSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const { ctx, companyId } = await requireCompanyUser(parsed.data.company_id);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.from("materials").insert({
    company_id: companyId,
    code: parsed.data.code,
    name: parsed.data.name,
    type: parsed.data.type,
    base_uom: parsed.data.base_uom,
    density: parsed.data.density,
    notes: emptyToNull(parsed.data.notes),
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        error: "Bu kod ile bir malzeme zaten kayıtlı.",
        fieldErrors: { code: "Kod benzersiz olmalı." },
      };
    }
    return { error: error.message };
  }

  revalidatePath(companyModulePath(companyId, "materials"));
  redirect(companyModulePath(companyId, "materials"));
}
