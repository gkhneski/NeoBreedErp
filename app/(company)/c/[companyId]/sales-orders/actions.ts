"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ORDER_WRITE_ROLES, companyModulePath } from "@/types/roles";

export type OrderActionResult = { ok: true } | { ok: false; error: string };

// Depocu gelen B2B siparisi acinca gormus sayilir.
export async function markSalesOrderSeen(
  companyIdInput: string,
  orderIdInput: string,
): Promise<OrderActionResult> {
  const parsed = z
    .object({ company: z.string().uuid(), order: z.string().uuid() })
    .safeParse({ company: companyIdInput, order: orderIdInput });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const { companyId } = await requireCompanyRole(parsed.data.company, ORDER_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("sales_orders")
    .update({ seen_at: new Date().toISOString() })
    .eq("id", parsed.data.order)
    .eq("company_id", companyId)
    .is("seen_at", null);
  if (error) return { ok: false, error: error.message };

  revalidatePath(companyModulePath(companyId, "sales-orders"));
  revalidatePath(companyModulePath(companyId));
  return { ok: true };
}

export async function markAllSalesOrdersSeen(
  companyIdInput: string,
): Promise<OrderActionResult> {
  if (!z.string().uuid().safeParse(companyIdInput).success) {
    return { ok: false, error: "Geçersiz istek." };
  }
  const { companyId } = await requireCompanyRole(companyIdInput, ORDER_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("sales_orders")
    .update({ seen_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .is("seen_at", null)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };

  revalidatePath(companyModulePath(companyId, "sales-orders"));
  revalidatePath(companyModulePath(companyId));
  return { ok: true };
}

const STATUS_VALUES = ["confirmed", "preparing", "cancelled"] as const;

// Durum gecisi. Sevkiyata donusturme (status=shipped) ayri bir akista (F4).
export async function setSalesOrderStatus(
  companyIdInput: string,
  orderIdInput: string,
  statusInput: (typeof STATUS_VALUES)[number],
): Promise<OrderActionResult> {
  const parsed = z
    .object({
      company: z.string().uuid(),
      order: z.string().uuid(),
      status: z.enum(STATUS_VALUES),
    })
    .safeParse({
      company: companyIdInput,
      order: orderIdInput,
      status: statusInput,
    });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company,
    ORDER_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: order } = await supabase
    .from("sales_orders")
    .select("status")
    .eq("id", parsed.data.order)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!order) return { ok: false, error: "Sipariş bulunamadı." };
  if (order.status === "shipped" || order.status === "cancelled") {
    return { ok: false, error: "Bu sipariş kapanmış; durumu değiştirilemez." };
  }

  const { error } = await supabase
    .from("sales_orders")
    .update({
      status: parsed.data.status,
      seen_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", parsed.data.order)
    .eq("company_id", companyId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(companyModulePath(companyId, "sales-orders"));
  revalidatePath(companyModulePath(companyId));
  return { ok: true };
}
