"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { withFlash } from "@/lib/flash";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PRODUCTION_WRITE_ROLES, companyModulePath } from "@/types/roles";

const productionOrderCreateSchema = z.object({
  recipe_id: z.string().uuid({ message: "Reçete seçiniz." }),
  planned_quantity: z
    .string()
    .trim()
    .min(1, "Hedef miktar gerekli.")
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v > 0, {
      message: "Hedef miktar pozitif bir sayı olmalı.",
    }),
  planned_start_at: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine((v) => v === null || !Number.isNaN(Date.parse(v)), {
      message: "Geçerli bir başlangıç tarihi giriniz.",
    }),
  planned_end_at: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine((v) => v === null || !Number.isNaN(Date.parse(v)), {
      message: "Geçerli bir bitiş tarihi giriniz.",
    }),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type ProductionOrderFormState = {
  error?: string;
  fieldErrors?: Partial<
    Record<keyof z.input<typeof productionOrderCreateSchema>, string>
  >;
};

async function nextProductionCode(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  companyId: string,
): Promise<string> {
  const { data } = await supabase
    .from("production_orders")
    .select("code")
    .eq("company_id", companyId)
    .like("code", "PO-%");

  const max = (data ?? []).reduce((current, row) => {
    const match = row.code.match(/^PO-(\d+)$/i);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);

  return `PO-${String(max + 1).padStart(6, "0")}`;
}

function emptyToNull(v: string | undefined | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function createProductionOrder(
  routeCompanyId: string,
  _prev: ProductionOrderFormState,
  formData: FormData,
): Promise<ProductionOrderFormState> {
  const parsed = productionOrderCreateSchema.safeParse({
    recipe_id: formData.get("recipe_id") ?? "",
    planned_quantity: formData.get("planned_quantity") ?? "",
    planned_start_at: formData.get("planned_start_at") ?? "",
    planned_end_at: formData.get("planned_end_at") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: ProductionOrderFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<
        typeof productionOrderCreateSchema
      >;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  if (
    parsed.data.planned_start_at &&
    parsed.data.planned_end_at &&
    parsed.data.planned_end_at < parsed.data.planned_start_at
  ) {
    return {
      fieldErrors: { planned_end_at: "Bitiş başlangıçtan önce olamaz." },
      error: "Form alanlarını kontrol edin.",
    };
  }

  const { ctx, companyId } = await requireCompanyRole(
    routeCompanyId,
    PRODUCTION_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .select("id, company_id, status, finished_material_id, yield_uom")
    .eq("id", parsed.data.recipe_id)
    .maybeSingle();

  if (recipeError || !recipe || recipe.company_id !== companyId) {
    return {
      fieldErrors: { recipe_id: "Reçete bulunamadı." },
      error: "Geçersiz reçete.",
    };
  }
  if (recipe.status !== "published") {
    return {
      fieldErrors: {
        recipe_id: "Yalnızca yayınlanmış reçeteden üretim emri açılabilir.",
      },
      error: "Reçete yayınlanmış değil.",
    };
  }

  const code = await nextProductionCode(supabase, companyId);

  const { data, error } = await supabase
    .from("production_orders")
    .insert({
      company_id: companyId,
      code,
      finished_material_id: recipe.finished_material_id,
      recipe_id: recipe.id,
      planned_quantity: parsed.data.planned_quantity,
      planned_uom: recipe.yield_uom,
      status: "draft",
      planned_start_at: parsed.data.planned_start_at,
      planned_end_at: parsed.data.planned_end_at,
      notes: emptyToNull(parsed.data.notes),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { error: "Kod çakışması oluştu, lütfen tekrar deneyin." };
    }
    if (error?.code === "23514") {
      return { error: error.message };
    }
    return { error: error?.message ?? "Üretim emri oluşturulamadı." };
  }

  revalidatePath(companyModulePath(companyId, "production"));
  redirect(
    withFlash(companyModulePath(companyId, "production", data.id), "created"),
  );
}

const transitionSchema = z.object({
  order_id: z.string().uuid(),
});

export async function planProductionOrder(
  routeCompanyId: string,
  formData: FormData,
): Promise<void> {
  const parsed = transitionSchema.safeParse({
    order_id: formData.get("order_id") ?? "",
  });
  if (!parsed.success) return;

  const { ctx, companyId } = await requireCompanyRole(
    routeCompanyId,
    PRODUCTION_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: order } = await supabase
    .from("production_orders")
    .select("id, status, company_id")
    .eq("id", parsed.data.order_id)
    .maybeSingle();

  if (!order || order.company_id !== companyId) {
    throw new Error("Üretim emri bulunamadı.");
  }
  if (order.status !== "draft") {
    throw new Error("Yalnızca taslak üretim emri planlanabilir.");
  }

  const { error } = await supabase
    .from("production_orders")
    .update({ status: "planned", updated_by: ctx.userId })
    .eq("id", order.id)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath(companyModulePath(companyId, "production"));
  revalidatePath(companyModulePath(companyId, "production", order.id));
}

const startSchema = z.object({
  order_id: z.string().uuid(),
  batch_number: z
    .string()
    .trim()
    .min(1, "Parti numarası gerekli.")
    .max(64, "Parti numarası en fazla 64 karakter olabilir.")
    .regex(
      /^[A-Za-z0-9._\-/]+$/,
      "Parti numarası yalnızca harf, rakam, nokta, alt çizgi, tire ve eğik çizgi içerebilir.",
    ),
});

export type StartProductionOrderState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.input<typeof startSchema>, string>>;
};

export async function startProductionOrder(
  routeCompanyId: string,
  _prev: StartProductionOrderState,
  formData: FormData,
): Promise<StartProductionOrderState> {
  const parsed = startSchema.safeParse({
    order_id: formData.get("order_id") ?? "",
    batch_number: formData.get("batch_number") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: StartProductionOrderState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof startSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    PRODUCTION_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("start_production_order", {
    p_company_id: companyId,
    p_order_id: parsed.data.order_id,
    p_batch_number: parsed.data.batch_number,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        error: "Bu parti numarası zaten kullanılmış.",
        fieldErrors: { batch_number: "Parti numarası benzersiz olmalı." },
      };
    }
    return { error: error.message };
  }

  revalidatePath(companyModulePath(companyId, "production"));
  revalidatePath(
    companyModulePath(companyId, "production", parsed.data.order_id),
  );
  redirect(
    withFlash(
      companyModulePath(companyId, "production", parsed.data.order_id),
      "saved",
    ),
  );
}

const completeItemSchema = z.object({
  recipe_item_id: z.string().uuid(),
  lot_id: z.string().uuid({ message: "Lot seçiniz." }),
  quantity: z
    .string()
    .trim()
    .min(1, "Tüketim miktarı gerekli.")
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v > 0, {
      message: "Miktar pozitif olmalı.",
    }),
});

const completeSchema = z.object({
  order_id: z.string().uuid(),
  batch_id: z.string().uuid(),
  actual_quantity: z
    .string()
    .trim()
    .min(1, "Gerçek üretim miktarı gerekli.")
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v > 0, {
      message: "Gerçek miktar pozitif olmalı.",
    }),
  output_lot_number: z
    .string()
    .trim()
    .min(1, "Çıkış lot numarası gerekli.")
    .max(64)
    .regex(
      /^[A-Za-z0-9._\-/]+$/,
      "Lot numarası yalnızca harf, rakam, nokta, alt çizgi, tire ve eğik çizgi içerebilir.",
    ),
  output_expiry_date: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), {
      message: "Tarih yyyy-aa-gg olmalı.",
    }),
  items: z.array(completeItemSchema).min(1, "En az bir kalem gerekli."),
});

export type CompleteBatchState = {
  error?: string;
  fieldErrors?: {
    actual_quantity?: string;
    output_lot_number?: string;
    output_expiry_date?: string;
    items?: Record<string, string>;
  };
};

export async function completeProductionBatch(
  routeCompanyId: string,
  _prev: CompleteBatchState,
  formData: FormData,
): Promise<CompleteBatchState> {
  const order_id = String(formData.get("order_id") ?? "");
  const batch_id = String(formData.get("batch_id") ?? "");
  const actual_quantity = String(formData.get("actual_quantity") ?? "");
  const output_lot_number = String(formData.get("output_lot_number") ?? "");
  const output_expiry_date = String(formData.get("output_expiry_date") ?? "");

  const itemIds = formData.getAll("recipe_item_id").map((v) => String(v));
  const lotIds = formData.getAll("lot_id").map((v) => String(v));
  const quantities = formData.getAll("quantity").map((v) => String(v));

  const items = itemIds.map((recipe_item_id, idx) => ({
    recipe_item_id,
    lot_id: lotIds[idx] ?? "",
    quantity: quantities[idx] ?? "",
  }));

  const parsed = completeSchema.safeParse({
    order_id,
    batch_id,
    actual_quantity,
    output_lot_number,
    output_expiry_date,
    items,
  });

  if (!parsed.success) {
    const fieldErrors: CompleteBatchState["fieldErrors"] = { items: {} };
    for (const issue of parsed.error.issues) {
      const [head, idx, sub] = issue.path;
      if (head === "items" && typeof idx === "number") {
        const itemId = items[idx]?.recipe_item_id ?? `__${idx}`;
        fieldErrors.items![`${itemId}.${String(sub ?? "row")}`] = issue.message;
      } else if (head === "actual_quantity") {
        fieldErrors.actual_quantity = issue.message;
      } else if (head === "output_lot_number") {
        fieldErrors.output_lot_number = issue.message;
      } else if (head === "output_expiry_date") {
        fieldErrors.output_expiry_date = issue.message;
      }
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    PRODUCTION_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const consumed = parsed.data.items.map((i) => ({
    lot_id: i.lot_id,
    quantity: i.quantity,
  }));

  const { error } = await supabase.rpc("complete_production_batch", {
    p_company_id: companyId,
    p_batch_id: parsed.data.batch_id,
    p_actual_quantity: parsed.data.actual_quantity,
    p_output_lot_number: parsed.data.output_lot_number,
    p_output_expiry_date: parsed.data.output_expiry_date,
    p_consumed: consumed,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        error: "Bu çıkış lot numarası zaten kullanılmış.",
        fieldErrors: {
          output_lot_number: "Çıkış lot numarası benzersiz olmalı.",
        },
      };
    }
    if (error.code === "23514") {
      if (/below zero/i.test(error.message)) {
        return {
          error: "Tüketim, bir lotun stoğunu negatife düşürüyor.",
        };
      }
      return { error: error.message };
    }
    if (error.code === "23503") {
      return { error: "Seçilen lot veya parti bulunamadı." };
    }
    return { error: error.message };
  }

  revalidatePath(companyModulePath(companyId, "production"));
  revalidatePath(companyModulePath(companyId, "production", parsed.data.order_id));
  revalidatePath(companyModulePath(companyId, "lots"));
  revalidatePath(companyModulePath(companyId, "stock"));
  redirect(
    withFlash(
      companyModulePath(companyId, "production", parsed.data.order_id),
      "saved",
    ),
  );
}

export async function cancelProductionOrder(
  routeCompanyId: string,
  formData: FormData,
): Promise<void> {
  const parsed = transitionSchema.safeParse({
    order_id: formData.get("order_id") ?? "",
  });
  if (!parsed.success) return;

  const { ctx, companyId } = await requireCompanyRole(
    routeCompanyId,
    PRODUCTION_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: order } = await supabase
    .from("production_orders")
    .select("id, status, company_id")
    .eq("id", parsed.data.order_id)
    .maybeSingle();

  if (!order || order.company_id !== companyId) {
    throw new Error("Üretim emri bulunamadı.");
  }
  if (order.status !== "draft" && order.status !== "planned") {
    throw new Error(
      "Yalnızca taslak veya planlanmış emirler iptal edilebilir. Üretim başladıktan sonra düzeltme stok hareketi ile yapılır.",
    );
  }

  const { error } = await supabase
    .from("production_orders")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", order.id)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath(companyModulePath(companyId, "production"));
  revalidatePath(companyModulePath(companyId, "production", order.id));
}
