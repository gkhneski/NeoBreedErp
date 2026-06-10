"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { withFlash } from "@/lib/flash";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { ALLERGEN_CODES } from "./allergens";

const ALLOWED_UOM = ["g", "kg", "mg", "mL", "L", "unit"] as const;

const materialSchema = z.object({
  company_id: z.string().uuid(),
  material_id: z.string().uuid().optional().or(z.literal("")),
  preset: z.enum(["packaging"]).optional().or(z.literal("")),
  name: z.string().trim().min(2, "Ad en az 2 karakter olmalı.").max(200),
  type: z.enum(["raw", "finished"], { message: "Tip seçiniz." }),
  base_uom: z.enum(ALLOWED_UOM, { message: "Geçerli bir birim seçiniz." }),
  density: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v > 0), {
      message: "Yoğunluk pozitif bir sayı olmalı.",
    }),
  default_supplier_id: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine(
      (v) =>
        v === null ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
      { message: "Geçersiz tedarikçi." },
    ),
  allergen_flags: z
    .array(z.enum(ALLERGEN_CODES))
    .max(ALLERGEN_CODES.length)
    .default([]),
  storage_conditions: z.string().trim().max(500).optional().or(z.literal("")),
  regulatory_notes: z.string().trim().max(4000).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  return_to: z.string().trim().optional().or(z.literal("")),
});

export type MaterialFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.input<typeof materialSchema>, string>>;
};

function emptyToNull(v: string | undefined | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function parseMaterialForm(formData: FormData) {
  return materialSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    material_id: formData.get("material_id") ?? "",
    preset: formData.get("preset") ?? "",
    name: formData.get("name") ?? "",
    type: formData.get("type") ?? "",
    base_uom: formData.get("base_uom") ?? "",
    density: formData.get("density") ?? "",
    default_supplier_id: formData.get("default_supplier_id") ?? "",
    allergen_flags: formData.getAll("allergen_flags").map(String),
    storage_conditions: formData.get("storage_conditions") ?? "",
    regulatory_notes: formData.get("regulatory_notes") ?? "",
    notes: formData.get("notes") ?? "",
    return_to: formData.get("return_to") ?? "",
  });
}

function fieldErrorsFrom(
  issues: z.ZodIssue[],
): MaterialFormState["fieldErrors"] {
  const fieldErrors: MaterialFormState["fieldErrors"] = {};
  for (const issue of issues) {
    const key = issue.path[0] as keyof z.input<typeof materialSchema>;
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

async function nextMaterialCode(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  companyId: string,
  prefix: string,
) {
  const { data } = await supabase
    .from("materials")
    .select("code")
    .eq("company_id", companyId)
    .like("code", `${prefix}-%`);

  const max = (data ?? []).reduce((current, row) => {
    const match = row.code.match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);

  return `${prefix}-${String(max + 1).padStart(2, "0")}`;
}

export async function createMaterial(
  _prev: MaterialFormState,
  formData: FormData,
): Promise<MaterialFormState> {
  const parsed = parseMaterialForm(formData);

  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      error: "Form alanlarini kontrol edin.",
    };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();
  const prefix =
    parsed.data.preset === "packaging"
      ? "AMB"
      : parsed.data.type === "finished"
        ? "URN"
        : "HAM";
  const code = await nextMaterialCode(supabase, companyId, prefix);

  const { error } = await supabase.from("materials").insert({
    company_id: companyId,
    code,
    name: parsed.data.name,
    type: parsed.data.type,
    base_uom: parsed.data.base_uom,
    density: parsed.data.density,
    default_supplier_id: parsed.data.default_supplier_id,
    allergen_flags: parsed.data.allergen_flags,
    storage_conditions: emptyToNull(parsed.data.storage_conditions),
    regulatory_notes: emptyToNull(parsed.data.regulatory_notes),
    notes: emptyToNull(parsed.data.notes),
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Otomatik kod oluşturulamadı; lütfen tekrar deneyin." };
    }
    if (error.code === "23514") {
      return {
        error: "Seçilen tedarikçi farklı bir firmaya ait.",
        fieldErrors: { default_supplier_id: "Geçersiz tedarikçi." },
      };
    }
    return { error: error.message };
  }

  revalidatePath(companyModulePath(companyId, "materials"));
  revalidatePath(companyModulePath(companyId, "products"));
  revalidatePath(companyModulePath(companyId, "packaging"));
  const returnTo = emptyToNull(parsed.data.return_to);
  if (returnTo?.startsWith(`/c/${companyId}/`)) {
    revalidatePath(returnTo);
    redirect(withFlash(returnTo, "created"));
  }
  redirect(withFlash(companyModulePath(companyId, "materials"), "created"));
}

export async function updateMaterial(
  _prev: MaterialFormState,
  formData: FormData,
): Promise<MaterialFormState> {
  const parsed = parseMaterialForm(formData);

  if (!parsed.success || !parsed.data.material_id) {
    return {
      fieldErrors: parsed.success
        ? {}
        : fieldErrorsFrom(parsed.error.issues),
      error: "Form alanlarini kontrol edin.",
    };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("materials")
    .update({
      name: parsed.data.name,
      type: parsed.data.type,
      base_uom: parsed.data.base_uom,
      density: parsed.data.density,
      default_supplier_id: parsed.data.default_supplier_id,
      allergen_flags: parsed.data.allergen_flags,
      storage_conditions: emptyToNull(parsed.data.storage_conditions),
      regulatory_notes: emptyToNull(parsed.data.regulatory_notes),
      notes: emptyToNull(parsed.data.notes),
      updated_by: ctx.userId,
    })
    .eq("id", parsed.data.material_id)
    .eq("company_id", companyId);

  if (error) {
    if (error.code === "23514") {
      return {
        error: "Seçilen tedarikçi farklı bir firmaya ait.",
        fieldErrors: { default_supplier_id: "Geçersiz tedarikçi." },
      };
    }
    return { error: error.message };
  }

  revalidatePath(companyModulePath(companyId, "materials"));
  revalidatePath(companyModulePath(companyId, "materials", parsed.data.material_id));
  revalidatePath(companyModulePath(companyId, "products"));
  revalidatePath(companyModulePath(companyId, "packaging"));
  const returnTo = emptyToNull(parsed.data.return_to);
  if (returnTo?.startsWith(`/c/${companyId}/`)) {
    revalidatePath(returnTo);
    redirect(withFlash(returnTo, "updated"));
  }
  redirect(
    withFlash(
      companyModulePath(companyId, "materials", parsed.data.material_id),
      "updated",
    ),
  );
}

export async function deleteMaterial(
  companyId: string,
  materialId: string,
  returnTo?: string,
): Promise<void> {
  const { ctx } = await requireCompanyRole(companyId, MASTER_DATA_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("materials")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", materialId)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath(companyModulePath(companyId, "materials"));
  revalidatePath(companyModulePath(companyId, "products"));
  revalidatePath(companyModulePath(companyId, "packaging"));
  redirect(
    withFlash(
      returnTo?.startsWith(`/c/${companyId}/`)
        ? returnTo
        : companyModulePath(companyId, "materials"),
      "deleted",
    ),
  );
}
