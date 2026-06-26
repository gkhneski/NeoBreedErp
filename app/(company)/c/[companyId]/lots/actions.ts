"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { withFlash } from "@/lib/flash";
import {
  isSupportedCurrency,
  normalizeSupportedCurrency,
} from "@/lib/currencies";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  QUALITY_WRITE_ROLES,
  STOCK_WRITE_ROLES,
  companyModulePath,
} from "@/types/roles";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || uuidRegex.test(v), {
    message: "Geçersiz seçim.",
  });

const dateOptional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), {
    message: "Tarih formatı yyyy-aa-gg olmalı.",
  });

const lotCreateSchema = z
  .object({
    company_id: z.string().uuid(),
    material_id: z.string().uuid({ message: "Malzeme seçiniz." }),
    supplier_id: optionalUuid,
    lot_number: z
      .string()
      .trim()
      .min(1, "Lot numarası boş olamaz.")
      .max(64, "Lot numarası en fazla 64 karakter olabilir.")
      .regex(
        /^[A-Za-z0-9._\-/]+$/,
        "Lot numarası yalnızca harf, rakam, nokta, tire, alt çizgi ve eğik çizgi içerebilir.",
      ),
    received_at: dateOptional,
    expiry_date: dateOptional,
    quantity: z
      .string()
      .trim()
      .min(1, "Miktar gerekli.")
      .transform((v) => Number(v))
      .refine((v) => Number.isFinite(v) && v > 0, {
        message: "Miktar pozitif bir sayı olmalı.",
      }),
    unit_cost: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? Number(v) : null))
      .refine((v) => v === null || (Number.isFinite(v) && v >= 0), {
        message: "Birim maliyet 0 veya pozitif olmalı.",
      }),
    currency: z
      .string()
      .trim()
      .max(3)
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v.toUpperCase() : ""))
      .refine(
        (v) => !v || isSupportedCurrency(v),
        "Para birimi TRY, USD veya EUR olmalı.",
      ),
    owner_customer_id: optionalUuid,
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .refine(
    (d) => !d.expiry_date || !d.received_at || d.expiry_date >= d.received_at,
    { message: "Son kullanma alış tarihinden önce olamaz.", path: ["expiry_date"] },
  )
  .refine((d) => !d.owner_customer_id || d.unit_cost === null, {
    message: "Müşteri malı lota birim maliyet girilemez.",
    path: ["unit_cost"],
  });

export type LotFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.input<typeof lotCreateSchema>, string>>;
};

function emptyToNull(v: string | undefined | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function createLot(
  _prev: LotFormState,
  formData: FormData,
): Promise<LotFormState> {
  const parsed = lotCreateSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    material_id: formData.get("material_id") ?? "",
    supplier_id: formData.get("supplier_id") ?? "",
    lot_number: formData.get("lot_number") ?? "",
    received_at: formData.get("received_at") ?? "",
    expiry_date: formData.get("expiry_date") ?? "",
    quantity: formData.get("quantity") ?? "",
    unit_cost: formData.get("unit_cost") ?? "",
    currency: formData.get("currency") ?? "",
    owner_customer_id: formData.get("owner_customer_id") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: LotFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof lotCreateSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const { companyId } = await requireCompanyRole(
    parsed.data.company_id,
    STOCK_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("create_lot_with_receipt", {
    p_company_id: companyId,
    p_material_id: parsed.data.material_id,
    p_supplier_id: parsed.data.supplier_id,
    p_lot_number: parsed.data.lot_number,
    p_received_at: parsed.data.received_at,
    p_expiry_date: parsed.data.expiry_date,
    p_unit_cost: parsed.data.unit_cost,
    p_currency: normalizeSupportedCurrency(parsed.data.currency),
    p_quantity: parsed.data.quantity,
    p_notes: emptyToNull(parsed.data.notes),
    p_movement_notes: null,
    p_owner_customer_id: parsed.data.owner_customer_id,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        error: "Bu malzeme için aynı lot numarası zaten kayıtlı.",
        fieldErrors: { lot_number: "Lot numarası benzersiz olmalı." },
      };
    }
    if (error.code === "23514") {
      return { error: error.message };
    }
    if (error.code === "23503") {
      return { error: "Seçilen malzeme veya tedarikçi bulunamadı." };
    }
    return { error: error.message };
  }

  revalidatePath(companyModulePath(companyId, "lots"));
  revalidatePath(companyModulePath(companyId, "stock"));
  redirect(withFlash(companyModulePath(companyId, "lots"), "created"));
}

const onboardLotSchema = z.object({
  company_id: z.string().uuid(),
  material_id: z.string().uuid({ message: "Ürün seçiniz." }),
  lot_number: z
    .string()
    .trim()
    .min(1, "Lot numarası boş olamaz.")
    .max(64, "Lot numarası en fazla 64 karakter olabilir.")
    .regex(
      /^[A-Za-z0-9._\-/]+$/,
      "Lot numarası yalnızca harf, rakam, nokta, tire, alt çizgi ve eğik çizgi içerebilir.",
    ),
  expiry_date: dateOptional,
  quantity: z
    .string()
    .trim()
    .min(1, "Miktar gerekli.")
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v > 0, {
      message: "Miktar pozitif bir sayı olmalı.",
    }),
  location_id: z.string().uuid({ message: "Konum seçiniz." }),
});

export type OnboardLotState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.input<typeof onboardLotSchema>, string>>;
  created?: { id: string; lot_number: string };
};

export async function onboardLot(
  _prev: OnboardLotState,
  formData: FormData,
): Promise<OnboardLotState> {
  const parsed = onboardLotSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    material_id: formData.get("material_id") ?? "",
    lot_number: formData.get("lot_number") ?? "",
    expiry_date: formData.get("expiry_date") ?? "",
    quantity: formData.get("quantity") ?? "",
    location_id: formData.get("location_id") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: OnboardLotState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.input<typeof onboardLotSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const { companyId } = await requireCompanyRole(
    parsed.data.company_id,
    STOCK_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: lotId, error } = await supabase.rpc("create_lot_with_receipt", {
    p_company_id: companyId,
    p_material_id: parsed.data.material_id,
    p_supplier_id: null,
    p_lot_number: parsed.data.lot_number,
    p_received_at: null,
    p_expiry_date: parsed.data.expiry_date,
    p_unit_cost: null,
    p_currency: null,
    p_quantity: parsed.data.quantity,
    p_notes: null,
    p_movement_notes: "initial stock onboarding",
    p_owner_customer_id: null,
    p_status: "released",
    p_location_id: parsed.data.location_id,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        error: "Bu ürün için aynı lot numarası zaten kayıtlı.",
        fieldErrors: { lot_number: "Lot numarası benzersiz olmalı." },
      };
    }
    if (error.code === "23503") {
      return { error: "Seçilen ürün veya konum bulunamadı." };
    }
    return { error: error.message };
  }

  revalidatePath(companyModulePath(companyId, "lots"));
  revalidatePath(companyModulePath(companyId, "stock"));
  revalidatePath(companyModulePath(companyId));

  return {
    created: {
      id: String(lotId),
      lot_number: parsed.data.lot_number,
    },
  };
}

// --- Barcode-driven onboarding -------------------------------------------

export type ProductOption = {
  id: string;
  code: string;
  name: string;
  type: "raw" | "semi" | "finished";
  base_uom: string;
};

const barcodeSchema = z
  .string()
  .trim()
  .min(3, "Barkod en az 3 karakter olmalı.")
  .max(64, "Barkod en fazla 64 karakter olabilir.")
  .regex(/^[A-Za-z0-9._\-/]+$/, "Barkod geçersiz karakter içeriyor.");

export type ResolveBarcodeResult =
  | { ok: true; product: ProductOption }
  | { ok: false; notFound: true }
  | { ok: false; error: string };

// Okutulan barkoda karsilik gelen urunu bulur. Operator da kullanir (okuma).
export async function findProductByBarcode(
  companyIdInput: string,
  barcodeInput: string,
): Promise<ResolveBarcodeResult> {
  const company = z.string().uuid().safeParse(companyIdInput);
  const barcode = barcodeSchema.safeParse(barcodeInput);
  if (!company.success) return { ok: false, error: "Geçersiz istek." };
  if (!barcode.success) {
    return { ok: false, error: barcode.error.issues[0]?.message ?? "Geçersiz barkod." };
  }

  const { companyId } = await requireCompanyRole(company.data, STOCK_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("materials")
    .select("id, code, name, type, base_uom")
    .eq("company_id", companyId)
    .eq("barcode", barcode.data)
    .is("deleted_at", null)
    .maybeSingle<ProductOption>();

  if (!data) return { ok: false, notFound: true };
  return { ok: true, product: data };
}

const createProductSchema = z.object({
  company_id: z.string().uuid(),
  barcode: barcodeSchema,
  name: z.string().trim().min(1, "Ürün adı gerekli.").max(200),
});

export type CreateProductResult =
  | { ok: true; product: ProductOption }
  | { ok: false; error: string };

// Barkodu tanimsiz urunu, recete olmadan, bitmis urun olarak olusturur.
// Recete fabrika uretimi basladiginda eklenir. Stok girisi yapabilen herkes
// (depocu dahil) okuttugu kutuyu bitmis urun olarak tanimlayabilir; hammadde/
// tedarikci/recete/fiyat kapsami acilmaz.
export async function createFinishedProductWithBarcode(
  companyIdInput: string,
  barcodeInput: string,
  nameInput: string,
): Promise<CreateProductResult> {
  const parsed = createProductSchema.safeParse({
    company_id: companyIdInput,
    barcode: barcodeInput,
    name: nameInput,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Geçersiz veri." };
  }

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    STOCK_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  // Siradaki URN-NN kodu.
  const { data: existing } = await supabase
    .from("materials")
    .select("code")
    .eq("company_id", companyId)
    .like("code", "URN-%");
  const maxNum = (existing ?? []).reduce((max, row) => {
    const m = row.code.match(/^URN-(\d+)$/i);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  const code = `URN-${String(maxNum + 1).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("materials")
    .insert({
      company_id: companyId,
      code,
      name: parsed.data.name,
      type: "finished",
      base_uom: "unit",
      barcode: parsed.data.barcode,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id, code, name, type, base_uom")
    .single<ProductOption>();

  if (error || !data) {
    if (error?.code === "23505") {
      return {
        ok: false,
        error: "Bu barkod veya kod zaten kayıtlı. Sayfayı yenileyip tekrar deneyin.",
      };
    }
    return { ok: false, error: error?.message ?? "Ürün oluşturulamadı." };
  }

  revalidatePath(companyModulePath(companyId, "lots", "onboarding"));
  return { ok: true, product: data };
}

export type TransferLotState = {
  error?: string;
};

const transferLotSchema = z.object({
  company_id: z.string().uuid(),
  lot_id: z.string().uuid(),
  to_location_id: z.string().uuid({ message: "Hedef depo seçiniz." }),
});

export async function transferLot(
  _prev: TransferLotState,
  formData: FormData,
): Promise<TransferLotState> {
  const parsed = transferLotSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    lot_id: formData.get("lot_id") ?? "",
    to_location_id: formData.get("to_location_id") ?? "",
  });
  if (!parsed.success) {
    return { error: "Hedef depo seçiniz." };
  }

  const { companyId } = await requireCompanyRole(
    parsed.data.company_id,
    STOCK_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("transfer_lot", {
    p_company_id: companyId,
    p_lot_id: parsed.data.lot_id,
    p_to_location_id: parsed.data.to_location_id,
    p_notes: null,
  });

  if (error) {
    if (error.message.includes("blocked lots")) {
      return {
        error: "Bloklu lotlar transfer edilemez.",
      };
    }
    if (error.message.includes("already at the target")) {
      return { error: "Lot zaten bu konumda." };
    }
    if (error.message.includes("no stock on hand")) {
      return { error: "Lotta transfer edilecek stok yok." };
    }
    return { error: error.message };
  }

  revalidatePath(companyModulePath(companyId, "lots"));
  revalidatePath(companyModulePath(companyId, "warehouse"));
  redirect(
    withFlash(
      companyModulePath(companyId, "lots", parsed.data.lot_id),
      "transferred",
    ),
  );
}

const lotStatusSchema = z.object({
  company_id: z.string().uuid(),
  lot_id: z.string().uuid(),
  status: z.enum(["quarantine", "released", "blocked"]),
});

export async function updateLotStatus(formData: FormData): Promise<void> {
  const parsed = lotStatusSchema.safeParse({
    company_id: formData.get("company_id") ?? "",
    lot_id: formData.get("lot_id") ?? "",
    status: formData.get("status") ?? "",
  });
  if (!parsed.success) return;

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company_id,
    QUALITY_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  await supabase
    .from("material_lots")
    .update({ status: parsed.data.status, updated_by: ctx.userId })
    .eq("id", parsed.data.lot_id)
    .eq("company_id", companyId);

  revalidatePath(companyModulePath(companyId, "lots"));
}
