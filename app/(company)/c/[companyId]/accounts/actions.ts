"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { postAccountTransaction } from "@/lib/accounts/post";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES, companyModulePath } from "@/types/roles";

export type AccountActionResult = { ok: true; note?: string } | { ok: false; error: string };

const entrySchema = z
  .object({
    company: z.string().uuid(),
    partyType: z.enum(["customer", "supplier"]),
    partyId: z.string().uuid(),
    kind: z.enum(["payment", "sale", "purchase", "adjustment"]),
    amount: z.number().refine((v) => Number.isFinite(v) && v !== 0, "Tutar gerekli."),
    docNo: z.string().trim().max(80).optional().or(z.literal("")),
    docDate: z
      .string()
      .trim()
      .optional()
      .or(z.literal(""))
      .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Tarih yyyy-aa-gg olmalı."),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .superRefine((d, ctx) => {
    if (d.kind === "payment") {
      if (!d.docNo) ctx.addIssue({ code: "custom", path: ["docNo"], message: "Dekont no zorunlu." });
      if (!d.docDate) ctx.addIssue({ code: "custom", path: ["docDate"], message: "Tarih zorunlu." });
    }
  });

// Manuel cari hareketi. Ödeme bakiyeyi düşürür (dekont no/tarih/tutar zorunlu);
// satış/alış/düzeltme bakiyeyi artırır (düzeltmede negatif tutar girilebilir).
export async function addAccountEntry(input: {
  company: string;
  partyType: "customer" | "supplier";
  partyId: string;
  kind: "payment" | "sale" | "purchase" | "adjustment";
  amount: number;
  docNo: string;
  docDate: string;
  notes: string;
}): Promise<AccountActionResult> {
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Geçersiz giriş." };
  }
  const d = parsed.data;

  const { ctx, companyId } = await requireCompanyRole(d.company, MASTER_DATA_WRITE_ROLES);

  // Verify party belongs to company.
  const table = d.partyType === "customer" ? "customers" : "suppliers";
  const supabase = await createServerSupabaseClient();
  const { data: party } = await supabase
    .from(table)
    .select("id")
    .eq("id", d.partyId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!party) return { ok: false, error: "Cari bu firmaya ait değil." };

  // Signed delta.
  const magnitude = Math.abs(d.amount);
  const delta =
    d.kind === "payment"
      ? -magnitude
      : d.kind === "adjustment"
        ? d.amount // allow negative adjustments
        : magnitude; // sale / purchase increase balance

  const service = createServiceRoleClient();
  const res = await postAccountTransaction(service, {
    companyId,
    partyType: d.partyType,
    partyId: d.partyId,
    kind: d.kind,
    amount: delta,
    occurredAt: d.docDate ? `${d.docDate}T00:00:00.000Z` : undefined,
    docNo: d.docNo || null,
    docDate: d.docDate || null,
    notes: d.notes || null,
    createdBy: ctx.userId,
  });
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath(companyModulePath(companyId, "accounts"));
  revalidatePath(companyModulePath(companyId, "accounts", d.partyType, d.partyId));
  return { ok: true, note: "Cari hareketi işlendi." };
}

// Bir satış siparişini müşteri carisine BORÇ olarak işler (kalem fiyatlarından).
export async function postSaleToAccount(
  companyIdInput: string,
  orderIdInput: string,
): Promise<AccountActionResult> {
  const parsed = z
    .object({ company: z.string().uuid(), order: z.string().uuid() })
    .safeParse({ company: companyIdInput, order: orderIdInput });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const { ctx, companyId } = await requireCompanyRole(parsed.data.company, MASTER_DATA_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  const { data: order } = await supabase
    .from("sales_orders")
    .select("id, code, customer_id, sales_order_items(quantity, unit_price)")
    .eq("id", parsed.data.order)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      code: string;
      customer_id: string;
      sales_order_items: Array<{ quantity: number; unit_price: number | null }> | null;
    }>();
  if (!order) return { ok: false, error: "Sipariş bulunamadı." };

  const total = (order.sales_order_items ?? []).reduce(
    (s, it) => s + Number(it.quantity) * Number(it.unit_price ?? 0),
    0,
  );
  if (total <= 0) {
    return {
      ok: false,
      error: "Sipariş kalemlerinde fiyat yok. Önce satış fiyatlarını girin veya cariye manuel borç ekleyin.",
    };
  }

  const service = createServiceRoleClient();
  const res = await postAccountTransaction(service, {
    companyId,
    partyType: "customer",
    partyId: order.customer_id,
    kind: "sale",
    amount: total,
    docNo: order.code,
    referenceKind: "sales_order",
    referenceId: order.id,
    notes: `${order.code} satışı`,
    createdBy: ctx.userId,
  });
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath(companyModulePath(companyId, "accounts"));
  revalidatePath(companyModulePath(companyId, "sales-orders"));
  return {
    ok: true,
    note: res.duplicate
      ? "Bu sipariş zaten cariye işlenmiş."
      : `Müşteri carisine ${total.toLocaleString("tr-TR")} ₺ borç işlendi.`,
  };
}
