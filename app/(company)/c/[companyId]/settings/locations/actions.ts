"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { withFlash } from "@/lib/flash";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES, companyModulePath } from "@/types/roles";

const locationSchema = z
  .object({
    company_id: z.string().uuid(),
    location_id: z.string().uuid().optional().or(z.literal("")),
    code: z
      .string()
      .trim()
      .min(2, "Kod en az 2 karakter olmalı.")
      .max(16, "Kod en fazla 16 karakter olabilir.")
      .regex(/^[A-Za-z0-9_-]+$/, "Kod yalnızca harf, rakam, tire ve alt çizgi içerebilir."),
    name: z.string().trim().min(2, "Ad en az 2 karakter olmalı.").max(120),
    kind: z.enum(["depot", "shelf"]),
    parent_id: z.string().uuid().optional().or(z.literal("")),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "shelf" && !data.parent_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parent_id"],
        message: "Raf için bağlı olduğu depo seçilmeli.",
      });
    }
  });

export type LocationFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.input<typeof locationSchema>, string>>;
};

function locationsPath(companyId: string): string {
  return companyModulePath(companyId, "settings", "locations");
}

function parseForm(formData: FormData) {
  return locationSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    location_id: formData.get("location_id") ?? "",
    code: formData.get("code") ?? "",
    name: formData.get("name") ?? "",
    kind: formData.get("kind") ?? "depot",
    parent_id: formData.get("parent_id") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

function fieldErrorsFrom(
  issues: z.ZodIssue[],
): LocationFormState["fieldErrors"] {
  const fieldErrors: LocationFormState["fieldErrors"] = {};
  for (const issue of issues) {
    const key = issue.path[0] as keyof z.input<typeof locationSchema>;
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function createLocation(
  _prev: LocationFormState,
  formData: FormData,
): Promise<LocationFormState> {
  const parsed = parseForm(formData);
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

  const { error } = await supabase.from("locations").insert({
    company_id: companyId,
    code: parsed.data.code.toUpperCase(),
    name: parsed.data.name,
    kind: parsed.data.kind,
    parent_id: parsed.data.kind === "shelf" ? parsed.data.parent_id : null,
    notes: parsed.data.notes?.trim() || null,
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        fieldErrors: { code: "Bu kod zaten kullanılıyor." },
        error: "Depo kodu firma içinde benzersiz olmalı.",
      };
    }
    return { error: error.message };
  }

  revalidatePath(locationsPath(companyId));
  redirect(withFlash(locationsPath(companyId), "created"));
}

export async function updateLocation(
  _prev: LocationFormState,
  formData: FormData,
): Promise<LocationFormState> {
  const parsed = parseForm(formData);
  if (!parsed.success || !parsed.data.location_id) {
    return {
      fieldErrors: parsed.success ? {} : fieldErrorsFrom(parsed.error.issues),
      error: "Form alanlarını kontrol edin.",
    };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("locations")
    .update({
      code: parsed.data.code.toUpperCase(),
      name: parsed.data.name,
      kind: parsed.data.kind,
      parent_id: parsed.data.kind === "shelf" ? parsed.data.parent_id : null,
      notes: parsed.data.notes?.trim() || null,
      updated_by: ctx.userId,
    })
    .eq("id", parsed.data.location_id)
    .eq("company_id", companyId);

  if (error) {
    if (error.code === "23505") {
      return {
        fieldErrors: { code: "Bu kod zaten kullanılıyor." },
        error: "Depo kodu firma içinde benzersiz olmalı.",
      };
    }
    return { error: error.message };
  }

  revalidatePath(locationsPath(companyId));
  redirect(withFlash(locationsPath(companyId), "updated"));
}

export async function deleteLocation(
  companyId: string,
  locationId: string,
): Promise<void> {
  const { ctx } = await requireCompanyRole(companyId, MASTER_DATA_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  const { data: location } = await supabase
    .from("locations")
    .select("id, is_default")
    .eq("id", locationId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!location) throw new Error("Depo bulunamadı.");
  if (location.is_default) {
    throw new Error("Varsayılan depo silinemez.");
  }

  const { count } = await supabase
    .from("material_lots")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("location_id", locationId)
    .is("deleted_at", null);

  if ((count ?? 0) > 0) {
    throw new Error("Bu konumda lot bulunduğu için silinemez.");
  }

  const { count: shelfCount } = await supabase
    .from("locations")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("parent_id", locationId)
    .is("deleted_at", null);

  if ((shelfCount ?? 0) > 0) {
    throw new Error("Bu depoya bağlı aktif raflar varken silinemez.");
  }

  const { error } = await supabase
    .from("locations")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", locationId)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath(locationsPath(companyId));
  redirect(withFlash(locationsPath(companyId), "deleted"));
}
