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
  product_barcode: z.string().trim().max(128).optional().or(z.literal("")),
  fason_customer_id: z.string().uuid().optional().or(z.literal("")),
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
    product_barcode: formData.get("product_barcode") ?? "",
    fason_customer_id: formData.get("fason_customer_id") ?? "",
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

  // Item selection is optional: the recipe stays a draft and publishRecipe
  // enforces the ≥1 YM rule. This breaks the chicken-and-egg for fason: the
  // product card must exist before its YM can be created.
  const selectedIds = new Set(formData.getAll("selected_material_id").map(String));

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
      itemErrors[item.materialId] = "Seçilen malzeme için pozitif miktar giriniz.";
    }
    if (!ALLOWED_UOM.includes(item.uom as (typeof ALLOWED_UOM)[number])) {
      itemErrors[item.materialId] = "Geçerli bir birim seçiniz.";
    }
  }

  if (Object.keys(itemErrors).length > 0) {
    return {
      itemErrors,
      error: "Seçilen malzeme satırlarını kontrol edin.",
    };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  if (selectedItems.length > 0) {
    const { data: materials, error: materialsError } = await supabase
      .from("materials")
      .select("id, company_id, code, type, deleted_at")
      .eq("company_id", companyId)
      .in(
        "id",
        selectedItems.map((item) => item.materialId),
      );

    if (materialsError) return { error: materialsError.message };

    // Phase 17: a Tam Mamül recipe holds YM + packaging (AMB-/PKG-) only.
    // Mirrors the DB trigger so no orphan product/recipe rows are left
    // behind by a trigger rejection.
    const isPackaging = (code: string) => /^(AMB|PKG)-/i.test(code);
    const validMaterialIds = new Set(
      (materials ?? [])
        .filter((m) => m.company_id === companyId && m.deleted_at === null)
        .filter((m) => m.type === "semi" || (m.type === "raw" && isPackaging(m.code)))
        .map((m) => m.id),
    );

    if (validMaterialIds.size !== selectedItems.length) {
      return {
        error:
          "Tam mamül reçetesine sadece yarı mamül (YM) ve ambalaj eklenebilir. Hammaddeler YM reçetesinde kullanılır.",
      };
    }
  }

  const fasonCustomerId = emptyToNull(parsed.data.fason_customer_id);
  if (fasonCustomerId) {
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("id", fasonCustomerId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!customer) {
      return { error: "Seçilen fason müşterisi bu firmaya ait değil." };
    }
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
      barcode: emptyToNull(parsed.data.product_barcode),
      fason_customer_id: fasonCustomerId,
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
    await supabase.from("materials").delete().eq("id", product.id);
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

  if (rows.length > 0) {
    const { error: itemsError } = await supabase.from("recipe_items").insert(rows);

    if (itemsError) {
      await supabase.from("recipes").delete().eq("id", recipe.id);
      await supabase.from("materials").delete().eq("id", product.id);
      return { error: itemsError.message };
    }
  }

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

// --- Pull Trendyol catalog image and persist it as the product thumbnail ------

export type PullImageResult = { ok: true } | { ok: false; error: string };

const PULL_MIME = /^image\/(jpeg|png|webp)/;
const PULL_MAX_BYTES = 8 * 1024 * 1024;

async function fetchAndStoreThumbnail(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  companyId: string,
  productId: string,
  url: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return { ok: false, error: "Resme ulaşılamadı." };
  }
  if (!res.ok) return { ok: false, error: `Resim indirilemedi (HTTP ${res.status}).` };
  const type = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0];
  if (!PULL_MIME.test(type)) return { ok: false, error: "Desteklenmeyen resim türü." };
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > PULL_MAX_BYTES) {
    return { ok: false, error: "Resim boyutu geçersiz." };
  }
  const { error } = await supabase.storage
    .from(TENANT_FILES_BUCKET)
    .upload(`${companyId}/products/${productId}/thumbnail`, bytes, {
      contentType: type,
      upsert: true,
    });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function pullTrendyolImage(
  routeCompanyId: string,
  productId: string,
): Promise<PullImageResult> {
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: product } = await supabase
    .from("materials")
    .select("id, barcode")
    .eq("id", productId)
    .eq("company_id", companyId)
    .eq("type", "finished")
    .is("deleted_at", null)
    .maybeSingle<{ id: string; barcode: string | null }>();

  if (!product) return { ok: false, error: "Ürün bulunamadı." };
  if (!product.barcode) {
    return {
      ok: false,
      error: "Üründe barkod yok; önce Trendyol ürünüyle eşleştirin.",
    };
  }

  const { data: remote } = await supabase
    .from("marketplace_remote_products")
    .select("image_url")
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .eq("barcode", product.barcode)
    .maybeSingle<{ image_url: string | null }>();

  if (!remote?.image_url) {
    return { ok: false, error: "Trendyol kataloğunda bu ürün için resim yok." };
  }

  const stored = await fetchAndStoreThumbnail(
    supabase,
    companyId,
    productId,
    remote.image_url,
  );
  if (!stored.ok) return stored;

  revalidatePath(companyModulePath(companyId, "products"));
  revalidatePath(companyModulePath(companyId, "products", productId));
  return { ok: true };
}

export type PullAllResult =
  | { ok: true; saved: number; skipped: number }
  | { ok: false; error: string };

export async function pullAllTrendyolImages(
  routeCompanyId: string,
): Promise<PullAllResult> {
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: products } = await supabase
    .from("materials")
    .select("id, barcode")
    .eq("company_id", companyId)
    .eq("type", "finished")
    .is("deleted_at", null)
    .not("barcode", "is", null)
    .returns<Array<{ id: string; barcode: string | null }>>();

  const list = (products ?? []).filter(
    (p): p is { id: string; barcode: string } => Boolean(p.barcode),
  );
  if (list.length === 0) return { ok: true, saved: 0, skipped: 0 };

  const barcodes = Array.from(new Set(list.map((p) => p.barcode)));
  const { data: remotes } = await supabase
    .from("marketplace_remote_products")
    .select("barcode, image_url")
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .in("barcode", barcodes);
  const imageByBarcode = new Map<string, string | null>();
  for (const r of remotes ?? []) imageByBarcode.set(r.barcode, r.image_url);

  let saved = 0;
  let skipped = 0;
  for (const p of list) {
    const url = imageByBarcode.get(p.barcode);
    if (!url) {
      skipped += 1;
      continue;
    }
    const stored = await fetchAndStoreThumbnail(supabase, companyId, p.id, url);
    if (stored.ok) saved += 1;
    else skipped += 1;
  }

  revalidatePath(companyModulePath(companyId, "products"));
  return { ok: true, saved, skipped };
}
