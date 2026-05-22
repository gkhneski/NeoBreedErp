"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES, companyModulePath } from "@/types/roles";

const ALLOWED_UOM = ["g", "kg", "mg", "mL", "L", "unit"] as const;

const recipeSchema = z.object({
  company_id: z.string().uuid(),
  recipe_id: z.string().uuid().optional().or(z.literal("")),
  finished_material_id: z.string().uuid("Bitmiş ürün seçiniz."),
  name: z.string().trim().min(2, "Ad en az 2 karakter olmalı.").max(200),
  mode: z.enum(["quantity", "percentage"], { message: "Mod seçiniz." }),
  yield_quantity: z
    .string()
    .trim()
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v > 0, {
      message: "Verim miktarı pozitif bir sayı olmalı.",
    }),
  yield_uom: z.enum(ALLOWED_UOM, { message: "Geçerli bir birim seçiniz." }),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type RecipeFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.input<typeof recipeSchema>, string>>;
};

function emptyToNull(v: string | undefined | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function parseRecipeForm(formData: FormData) {
  return recipeSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    recipe_id: formData.get("recipe_id") ?? "",
    finished_material_id: formData.get("finished_material_id") ?? "",
    name: formData.get("name") ?? "",
    mode: formData.get("mode") ?? "",
    yield_quantity: formData.get("yield_quantity") ?? "",
    yield_uom: formData.get("yield_uom") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

function recipeFieldErrorsFrom(
  issues: z.ZodIssue[],
): RecipeFormState["fieldErrors"] {
  const fieldErrors: RecipeFormState["fieldErrors"] = {};
  for (const issue of issues) {
    const key = issue.path[0] as keyof z.input<typeof recipeSchema>;
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

async function nextRecipeCode(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  companyId: string,
) {
  const { data } = await supabase
    .from("recipes")
    .select("code")
    .eq("company_id", companyId)
    .like("code", "REC-%");

  const max = (data ?? []).reduce((current, row) => {
    const match = row.code.match(/^REC-(\d+)$/i);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);

  return `REC-${String(max + 1).padStart(2, "0")}`;
}

export async function createRecipe(
  _prev: RecipeFormState,
  formData: FormData,
): Promise<RecipeFormState> {
  const parsed = parseRecipeForm(formData);

  if (!parsed.success) {
    return {
      fieldErrors: recipeFieldErrorsFrom(parsed.error.issues),
      error: "Form alanlarini kontrol edin.",
    };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();
  const code = await nextRecipeCode(supabase, companyId);

  const { data, error } = await supabase
    .from("recipes")
    .insert({
      company_id: companyId,
      finished_material_id: parsed.data.finished_material_id,
      code,
      name: parsed.data.name,
      mode: parsed.data.mode,
      yield_quantity: parsed.data.yield_quantity,
      yield_uom: parsed.data.yield_uom,
      notes: emptyToNull(parsed.data.notes),
      status: "draft",
      version: 1,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { error: "Bu bitmiş ürün için bu versiyon zaten var." };
    }
    return { error: error?.message ?? "Reçete oluşturulamadı." };
  }

  revalidatePath(companyModulePath(companyId, "recipes"));
  redirect(companyModulePath(companyId, "recipes", data.id));
}

export async function updateRecipe(
  _prev: RecipeFormState,
  formData: FormData,
): Promise<RecipeFormState> {
  const parsed = parseRecipeForm(formData);

  if (!parsed.success || !parsed.data.recipe_id) {
    return {
      fieldErrors: parsed.success
        ? {}
        : recipeFieldErrorsFrom(parsed.error.issues),
      error: "Form alanlarini kontrol edin.",
    };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: recipe } = await supabase
    .from("recipes")
    .select("id, status, company_id")
    .eq("id", parsed.data.recipe_id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!recipe) return { error: "Reçete bulunamadı." };
  if (recipe.status !== "draft") {
    return { error: "Yalnızca taslak reçeteler düzenlenebilir." };
  }

  const { error } = await supabase
    .from("recipes")
    .update({
      finished_material_id: parsed.data.finished_material_id,
      name: parsed.data.name,
      mode: parsed.data.mode,
      yield_quantity: parsed.data.yield_quantity,
      yield_uom: parsed.data.yield_uom,
      notes: emptyToNull(parsed.data.notes),
      updated_by: ctx.userId,
    })
    .eq("id", parsed.data.recipe_id)
    .eq("company_id", companyId);

  if (error) return { error: error.message };

  revalidatePath(companyModulePath(companyId, "recipes"));
  revalidatePath(companyModulePath(companyId, "recipes", parsed.data.recipe_id));
  redirect(companyModulePath(companyId, "recipes", parsed.data.recipe_id));
}

const recipeItemAddSchema = z.object({
  company_id: z.string().uuid(),
  recipe_id: z.string().uuid(),
  material_id: z.string().uuid("Malzeme seçiniz."),
  quantity: z
    .string()
    .trim()
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v > 0, {
      message: "Miktar pozitif bir sayı olmalı.",
    }),
  uom: z.enum(ALLOWED_UOM, { message: "Birim seçiniz." }),
  percentage: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100), {
      message: "Yüzde 0 ile 100 arası olmalı.",
    }),
  active: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true" || v === undefined),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type RecipeItemFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.input<typeof recipeItemAddSchema>, string>>;
};

export async function addRecipeItem(
  _prev: RecipeItemFormState,
  formData: FormData,
): Promise<RecipeItemFormState> {
  const parsed = recipeItemAddSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    recipe_id: formData.get("recipe_id") ?? "",
    material_id: formData.get("material_id") ?? "",
    quantity: formData.get("quantity") ?? "",
    uom: formData.get("uom") ?? "",
    percentage: formData.get("percentage") ?? "",
    active: formData.get("active") ?? undefined,
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: RecipeItemFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof recipeItemAddSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Form alanlarini kontrol edin." };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .select("id, status, company_id")
    .eq("id", parsed.data.recipe_id)
    .maybeSingle();

  if (recipeError || !recipe || recipe.company_id !== companyId) {
    return { error: "Reçete bulunamadı." };
  }
  if (recipe.status !== "draft") {
    return { error: "Yalnızca taslak reçetelere kalem eklenebilir." };
  }

  const { data: maxPositionRow } = await supabase
    .from("recipe_items")
    .select("position")
    .eq("recipe_id", recipe.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = (maxPositionRow?.position ?? 0) + 1;

  const { error } = await supabase.from("recipe_items").insert({
    company_id: companyId,
    recipe_id: recipe.id,
    material_id: parsed.data.material_id,
    position: nextPosition,
    quantity: parsed.data.quantity,
    uom: parsed.data.uom,
    percentage: parsed.data.percentage,
    active: parsed.data.active ?? true,
    notes: emptyToNull(parsed.data.notes),
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });

  if (error) return { error: error.message };

  revalidatePath(companyModulePath(companyId, "recipes", recipe.id));
  return {};
}

export async function removeRecipeItem(
  companyId: string,
  recipeId: string,
  itemId: string,
): Promise<void> {
  await requireCompanyRole(companyId, MASTER_DATA_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  const { data: recipe } = await supabase
    .from("recipes")
    .select("id, status, company_id")
    .eq("id", recipeId)
    .maybeSingle();

  if (!recipe || recipe.company_id !== companyId) {
    throw new Error("Reçete bulunamadı.");
  }
  if (recipe.status !== "draft") {
    throw new Error("Yalnızca taslak reçetelerden kalem silinebilir.");
  }

  const { error } = await supabase
    .from("recipe_items")
    .delete()
    .eq("id", itemId)
    .eq("recipe_id", recipeId);

  if (error) throw new Error(error.message);

  revalidatePath(companyModulePath(companyId, "recipes", recipeId));
}

export async function publishRecipe(
  companyId: string,
  recipeId: string,
): Promise<void> {
  const { ctx } = await requireCompanyRole(companyId, MASTER_DATA_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  const { data: recipe } = await supabase
    .from("recipes")
    .select("id, status, mode, company_id")
    .eq("id", recipeId)
    .maybeSingle();

  if (!recipe || recipe.company_id !== companyId) {
    throw new Error("Reçete bulunamadı.");
  }
  if (recipe.status !== "draft") {
    throw new Error("Yalnızca taslak reçeteler yayınlanabilir.");
  }

  const { data: items } = await supabase
    .from("recipe_items")
    .select("percentage, active")
    .eq("recipe_id", recipeId);

  if (!items || items.length === 0) {
    throw new Error("Reçete en az bir kalem içermeli.");
  }

  if (recipe.mode === "percentage") {
    const total = items
      .filter((i) => i.active)
      .reduce((sum, i) => sum + (i.percentage ?? 0), 0);
    if (Math.abs(total - 100) > 0.0001) {
      throw new Error(`Aktif kalemlerin yüzdesi 100 olmalı (şu an: ${total.toFixed(4)}).`);
    }
  }

  const { error } = await supabase
    .from("recipes")
    .update({ status: "published", updated_by: ctx.userId })
    .eq("id", recipeId);

  if (error) {
    if (error.code === "23505") {
      throw new Error(
        "Bu bitmiş ürün için zaten yayınlanmış bir reçete var. Önce onu arşivleyin.",
      );
    }
    throw new Error(error.message);
  }

  revalidatePath(companyModulePath(companyId, "recipes"));
  revalidatePath(companyModulePath(companyId, "recipes", recipeId));
}

export async function createNewRecipeVersion(
  companyId: string,
  recipeId: string,
): Promise<void> {
  const { ctx } = await requireCompanyRole(companyId, MASTER_DATA_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  const { data: source } = await supabase
    .from("recipes")
    .select(
      "id, company_id, finished_material_id, code, name, version, mode, yield_quantity, yield_uom, notes, status",
    )
    .eq("id", recipeId)
    .maybeSingle();

  if (!source || source.company_id !== companyId) {
    throw new Error("Reçete bulunamadı.");
  }
  if (source.status !== "published") {
    throw new Error("Yalnızca yayınlanmış bir reçeteden yeni versiyon oluşturulabilir.");
  }

  const { data: latest } = await supabase
    .from("recipes")
    .select("version")
    .eq("company_id", companyId)
    .eq("finished_material_id", source.finished_material_id)
    .is("deleted_at", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latest?.version ?? source.version) + 1;
  const nextCode = `${source.code}.v${nextVersion}`;

  const { data: newRecipe, error: insertError } = await supabase
    .from("recipes")
    .insert({
      company_id: companyId,
      finished_material_id: source.finished_material_id,
      code: nextCode,
      name: source.name,
      version: nextVersion,
      status: "draft",
      mode: source.mode,
      yield_quantity: source.yield_quantity,
      yield_uom: source.yield_uom,
      notes: source.notes,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (insertError || !newRecipe) {
    throw new Error(insertError?.message ?? "Yeni versiyon oluşturulamadı.");
  }

  const { data: sourceItems } = await supabase
    .from("recipe_items")
    .select("material_id, position, quantity, uom, percentage, active, notes")
    .eq("recipe_id", source.id)
    .order("position", { ascending: true });

  if (sourceItems && sourceItems.length > 0) {
    const rows = sourceItems.map((i) => ({
      company_id: companyId,
      recipe_id: newRecipe.id,
      material_id: i.material_id,
      position: i.position,
      quantity: i.quantity,
      uom: i.uom,
      percentage: i.percentage,
      active: i.active,
      notes: i.notes,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    }));
    const { error: itemsError } = await supabase.from("recipe_items").insert(rows);
    if (itemsError) throw new Error(itemsError.message);
  }

  revalidatePath(companyModulePath(companyId, "recipes"));
  redirect(companyModulePath(companyId, "recipes", newRecipe.id));
}

export async function deleteRecipe(
  companyId: string,
  recipeId: string,
): Promise<void> {
  const { ctx } = await requireCompanyRole(companyId, MASTER_DATA_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("recipes")
    .update({
      deleted_at: new Date().toISOString(),
      status: "archived",
      updated_by: ctx.userId,
    })
    .eq("id", recipeId)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath(companyModulePath(companyId, "recipes"));
  redirect(companyModulePath(companyId, "recipes"));
}
