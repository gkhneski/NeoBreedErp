"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { withFlash } from "@/lib/flash";
import { TENANT_FILES_BUCKET } from "@/lib/storage/attachments";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES, companyModulePath } from "@/types/roles";

const ALLOWED_UOM = ["g", "kg", "mg", "mL", "L", "unit"] as const;
const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
const THUMBNAIL_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

const productRecipeSchema = z.object({
  company_id: z.string().uuid(),
  product_name: z.string().trim().min(2, "Ürün adı en az 2 karakter olmalı.").max(200),
  product_uom: z.enum(ALLOWED_UOM, { message: "Geçerli bir ürün birimi seçiniz." }),
  recipe_name: z.string().trim().min(2, "Reçete adı en az 2 karakter olmalı.").max(200),
  yield_quantity: z
    .string()
    .trim()
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v > 0, {
      message: "Verim miktarı pozitif bir sayı olmalı.",
    }),
  yield_uom: z.enum(ALLOWED_UOM, { message: "Geçerli bir verim birimi seçiniz." }),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type ProductRecipeFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.input<typeof productRecipeSchema>, string>>;
  itemErrors?: Record<string, string>;
};

function emptyToNull(v: string | undefined | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

async function nextCode(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  table: "materials" | "recipes",
  companyId: string,
  prefix: string,
) {
  const { data } = await supabase
    .from(table)
    .select("code")
    .eq("company_id", companyId)
    .like("code", `${prefix}-%`);

  const max = (data ?? []).reduce((current, row) => {
    const match = row.code.match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);

  return `${prefix}-${String(max + 1).padStart(2, "0")}`;
}

export async function createProductWithRecipe(
  _prev: ProductRecipeFormState,
  formData: FormData,
): Promise<ProductRecipeFormState> {
  const parsed = productRecipeSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    product_name: formData.get("product_name") ?? "",
    product_uom: formData.get("product_uom") ?? "",
    recipe_name: formData.get("recipe_name") ?? "",
    yield_quantity: formData.get("yield_quantity") ?? "",
    yield_uom: formData.get("yield_uom") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: ProductRecipeFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof productRecipeSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const selectedIds = new Set(formData.getAll("selected_material_id").map(String));
  if (selectedIds.size === 0) {
    return { error: "Ürün reçetesi için en az bir hammadde seçiniz." };
  }

  const materialIds = formData.getAll("item_material_id").map(String);
  const quantities = formData.getAll("item_quantity").map(String);
  const uoms = formData.getAll("item_uom").map(String);

  const itemErrors: Record<string, string> = {};
  const selectedItems = materialIds
    .map((materialId, index) => ({
      materialId,
      quantity: Number(quantities[index] ?? ""),
      uom: uoms[index] ?? "",
    }))
    .filter((item) => selectedIds.has(item.materialId));

  for (const item of selectedItems) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      itemErrors[item.materialId] = "Seçilen hammadde için pozitif miktar giriniz.";
    }
    if (!ALLOWED_UOM.includes(item.uom as (typeof ALLOWED_UOM)[number])) {
      itemErrors[item.materialId] = "Geçerli bir birim seçiniz.";
    }
  }

  if (Object.keys(itemErrors).length > 0) {
    return {
      itemErrors,
      error: "Seçilen hammadde satırlarını kontrol edin.",
    };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: materials, error: materialsError } = await supabase
    .from("materials")
    .select("id, company_id, type, deleted_at")
    .eq("company_id", companyId)
    .in(
      "id",
      selectedItems.map((item) => item.materialId),
    );

  if (materialsError) return { error: materialsError.message };

  const validMaterialIds = new Set(
    (materials ?? [])
      .filter((m) => m.company_id === companyId && m.type === "raw" && m.deleted_at === null)
      .map((m) => m.id),
  );

  if (validMaterialIds.size !== selectedItems.length) {
    return { error: "Seçilen hammaddelerden biri bu firmaya ait değil veya aktif değil." };
  }

  const productCode = await nextCode(supabase, "materials", companyId, "URN");
  const recipeCode = await nextCode(supabase, "recipes", companyId, "REC");

  const { data: product, error: productError } = await supabase
    .from("materials")
    .insert({
      company_id: companyId,
      code: productCode,
      name: parsed.data.product_name,
      type: "finished",
      base_uom: parsed.data.product_uom,
      allergen_flags: [],
      notes: emptyToNull(parsed.data.notes),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (productError || !product) {
    if (productError?.code === "23505") {
      return { error: "Otomatik ürün kodu oluşturulamadı; lütfen tekrar deneyin." };
    }
    return { error: productError?.message ?? "Ürün kartı oluşturulamadı." };
  }

  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .insert({
      company_id: companyId,
      finished_material_id: product.id,
      code: recipeCode,
      name: parsed.data.recipe_name,
      mode: "quantity",
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

  if (recipeError || !recipe) {
    return { error: recipeError?.message ?? "Reçete oluşturulamadı." };
  }

  const rows = selectedItems.map((item, index) => ({
    company_id: companyId,
    recipe_id: recipe.id,
    material_id: item.materialId,
    position: index + 1,
    quantity: item.quantity,
    uom: item.uom,
    percentage: null,
    active: true,
    notes: null,
    created_by: ctx.userId,
    updated_by: ctx.userId,
  }));

  const { error: itemsError } = await supabase.from("recipe_items").insert(rows);

  if (itemsError) return { error: itemsError.message };

  revalidatePath(companyModulePath(companyId, "products"));
  revalidatePath(companyModulePath(companyId, "materials"));
  revalidatePath(companyModulePath(companyId, "recipes"));
  redirect(
    withFlash(companyModulePath(companyId, "recipes", recipe.id), "created"),
  );
}

export type ProductThumbnailState = {
  error?: string;
  ok?: boolean;
};

export async function uploadProductThumbnail(
  routeCompanyId: string,
  productId: string,
  _prev: ProductThumbnailState,
  formData: FormData,
): Promise<ProductThumbnailState> {
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: product } = await supabase
    .from("materials")
    .select("id, type, company_id")
    .eq("id", productId)
    .eq("company_id", companyId)
    .eq("type", "finished")
    .is("deleted_at", null)
    .maybeSingle();

  if (!product) return { error: "Ürün bulunamadı." };

  const file = formData.get("thumbnail");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Bir görsel seçiniz." };
  }
  if (!THUMBNAIL_MIME.includes(file.type as (typeof THUMBNAIL_MIME)[number])) {
    return { error: "Yalnızca JPG, PNG veya WEBP kabul edilir." };
  }
  if (file.size > THUMBNAIL_MAX_BYTES) {
    return { error: "Görsel en fazla 2 MB olabilir." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const storagePath = `${companyId}/products/${productId}/thumbnail`;
  const { error } = await supabase.storage
    .from(TENANT_FILES_BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type,
      upsert: true,
    });

  if (error) return { error: error.message };

  revalidatePath(companyModulePath(companyId, "products"));
  revalidatePath(companyModulePath(companyId, "products", productId, "edit"));
  return { ok: true };
}
