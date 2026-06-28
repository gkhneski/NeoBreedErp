"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { postAccountTransaction } from "@/lib/accounts/post";
import { normalizeSupportedCurrency } from "@/lib/currencies";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES, STOCK_WRITE_ROLES, companyModulePath } from "@/types/roles";

export type PoActionResult = { ok: true; note?: string } | { ok: false; error: string };

const idSchema = z.object({ company: z.string().uuid(), po: z.string().uuid() });

// Taslak satınalma siparişini tedarikçiye "gönderildi" olarak işaretler.
export async function sendPurchaseOrder(
  companyIdInput: string,
  poIdInput: string,
): Promise<PoActionResult> {
  const parsed = idSchema.safeParse({ company: companyIdInput, po: poIdInput });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: po } = await supabase
    .from("purchase_orders")
    .select("id, status")
    .eq("id", parsed.data.po)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; status: string }>();
  if (!po) return { ok: false, error: "Satınalma siparişi bulunamadı." };
  if (po.status !== "draft") {
    return { ok: false, error: "Yalnızca taslak siparişler gönderilebilir." };
  }

  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "sent", sent_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq("id", po.id)
    .eq("company_id", companyId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(companyModulePath(companyId, "purchase-orders"));
  revalidatePath(companyModulePath(companyId, "purchase-orders", po.id));
  return { ok: true, note: "Sipariş tedarikçiye gönderildi olarak işaretlendi." };
}

// Mal kabul: PO satırlarını lot olarak stoğa alır (create_receipt_document),
// satırların alınan miktarını günceller ve siparişi "received" yapar.
export async function receivePurchaseOrder(
  companyIdInput: string,
  poIdInput: string,
): Promise<PoActionResult> {
  const parsed = idSchema.safeParse({ company: companyIdInput, po: poIdInput });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company,
    STOCK_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: po } = await supabase
    .from("purchase_orders")
    .select(
      "id, code, status, supplier_id, currency, " +
        "purchase_order_lines(id, material_id, quantity, uom, unit_cost, received_quantity)",
    )
    .eq("id", parsed.data.po)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      code: string;
      status: string;
      supplier_id: string | null;
      currency: string | null;
      purchase_order_lines: Array<{
        id: string;
        material_id: string;
        quantity: number;
        uom: string;
        unit_cost: number | null;
        received_quantity: number;
      }> | null;
    }>();
  if (!po) return { ok: false, error: "Satınalma siparişi bulunamadı." };
  if (po.status === "received") {
    return { ok: false, error: "Bu sipariş zaten mal kabul edildi." };
  }
  if (po.status === "cancelled") {
    return { ok: false, error: "İptal edilmiş sipariş kabul edilemez." };
  }
  const lines = po.purchase_order_lines ?? [];
  if (lines.length === 0) return { ok: false, error: "Siparişte satır yok." };

  const today = new Date().toISOString().slice(0, 10);
  const pLines = lines.map((l, i) => ({
    mode: "new_lot",
    material_id: l.material_id,
    lot_id: "",
    lot_number: `${po.code}-L${i + 1}`,
    expiry_date: "",
    quantity: String(l.quantity),
    unit_cost: l.unit_cost === null ? "" : String(l.unit_cost),
  }));

  const { error: rpcErr } = await supabase.rpc("create_receipt_document", {
    p_company_id: companyId,
    p_supplier_id: po.supplier_id,
    p_received_at: today,
    p_currency: normalizeSupportedCurrency(po.currency ?? "TRY"),
    p_doc_notes: `Satınalma ${po.code} mal kabulü`,
    p_lines: pLines,
  });
  if (rpcErr) {
    if (rpcErr.code === "23505") {
      return { ok: false, error: "Bu siparişin lotları zaten girilmiş olabilir (lot no çakışması)." };
    }
    return { ok: false, error: rpcErr.message };
  }

  for (const l of lines) {
    await supabase
      .from("purchase_order_lines")
      .update({ received_quantity: l.quantity })
      .eq("id", l.id)
      .eq("company_id", companyId);
  }
  await supabase
    .from("purchase_orders")
    .update({ status: "received", received_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq("id", po.id)
    .eq("company_id", companyId);

  // Tedarikçi carisine borç (verecek): satır maliyetleri toplamı.
  if (po.supplier_id) {
    const payable = lines.reduce(
      (s, l) => s + Number(l.quantity) * Number(l.unit_cost ?? 0),
      0,
    );
    if (payable > 0) {
      const service = createServiceRoleClient();
      await postAccountTransaction(service, {
        companyId,
        partyType: "supplier",
        partyId: po.supplier_id,
        kind: "purchase",
        amount: payable,
        currency: po.currency ?? "TRY",
        docNo: po.code,
        referenceKind: "purchase_order",
        referenceId: po.id,
        notes: `${po.code} mal kabulü`,
        createdBy: ctx.userId,
      });
    }
  }

  revalidatePath(companyModulePath(companyId, "accounts"));
  revalidatePath(companyModulePath(companyId, "purchase-orders"));
  revalidatePath(companyModulePath(companyId, "purchase-orders", po.id));
  revalidatePath(companyModulePath(companyId, "lots"));
  revalidatePath(companyModulePath(companyId, "stock"));
  return {
    ok: true,
    note: "Mal kabul yapıldı; lotlar karantinada oluşturuldu (Kalite'den serbest bırakın).",
  };
}
