"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyRole, requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STOCK_WRITE_ROLES, companyModulePath } from "@/types/roles";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ScannedLot = {
  id: string;
  lot_number: string;
  status: "quarantine" | "released" | "blocked";
  quantity_on_hand: number;
  material_code: string;
  material_name: string;
  base_uom: string;
  location_id: string | null;
  location_name: string | null;
  customer_owned_by: string | null;
};

export type ResolveLotResult =
  | { ok: true; lot: ScannedLot }
  | { ok: false; error: string };

export async function resolveLotForScan(
  routeCompanyId: string,
  query: string,
): Promise<ResolveLotResult> {
  const { companyId } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const trimmed = query.trim();
  if (!trimmed) return { ok: false, error: "Lot bilgisi boş." };

  let lotId: string | null = null;
  let lotNumber: string | null = null;

  if (trimmed.startsWith("http")) {
    const match = trimmed.match(/\/c\/([0-9a-f-]{36})\/lots\/([0-9a-f-]{36})/i);
    if (!match) {
      return { ok: false, error: "QR kodu bir lot etiketi değil." };
    }
    if (match[1].toLowerCase() !== companyId.toLowerCase()) {
      return { ok: false, error: "Bu etiket başka bir firmaya ait." };
    }
    lotId = match[2];
  } else if (uuidRegex.test(trimmed)) {
    lotId = trimmed;
  } else {
    lotNumber = trimmed;
  }

  let q = supabase
    .from("material_lots")
    .select(
      "id, lot_number, status, quantity_on_hand, location_id, " +
        "materials:material_id(code, name, base_uom), " +
        "customers:owner_customer_id(name), " +
        "locations:location_id(name)",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null);
  q = lotId ? q.eq("id", lotId) : q.eq("lot_number", lotNumber!);

  const { data: lot } = await q.limit(1).maybeSingle<{
    id: string;
    lot_number: string;
    status: "quarantine" | "released" | "blocked";
    quantity_on_hand: number;
    location_id: string | null;
    materials: { code: string; name: string; base_uom: string } | null;
    customers: { name: string } | null;
    locations: { name: string } | null;
  }>();

  if (!lot) {
    return { ok: false, error: "Lot bulunamadı." };
  }

  return {
    ok: true,
    lot: {
      id: lot.id,
      lot_number: lot.lot_number,
      status: lot.status,
      quantity_on_hand: Number(lot.quantity_on_hand),
      material_code: lot.materials?.code ?? "",
      material_name: lot.materials?.name ?? "",
      base_uom: lot.materials?.base_uom ?? "",
      location_id: lot.location_id,
      location_name: lot.locations?.name ?? null,
      customer_owned_by: lot.customers?.name ?? null,
    },
  };
}

const scanTransferSchema = z.object({
  company_id: z.string().uuid(),
  lot_id: z.string().uuid(),
  to_location_id: z.string().uuid(),
});

export type ScanTransferResult = { ok: true } | { ok: false; error: string };

export async function scanTransferLot(
  companyIdInput: string,
  lotIdInput: string,
  toLocationIdInput: string,
): Promise<ScanTransferResult> {
  const parsed = scanTransferSchema.safeParse({
    company_id: companyIdInput,
    lot_id: lotIdInput,
    to_location_id: toLocationIdInput,
  });
  if (!parsed.success) {
    return { ok: false, error: "Geçersiz transfer isteği." };
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
    p_notes: "barcode scan receipt",
  });

  if (error) {
    if (error.message.includes("only released lots")) {
      return {
        ok: false,
        error:
          "Yalnızca 'Serbest' lotlar transfer edilebilir. Önce QC ile serbest bırakın.",
      };
    }
    if (error.message.includes("already at the target")) {
      return { ok: false, error: "Bu lot zaten hedef depoda." };
    }
    if (error.message.includes("no stock on hand")) {
      return { ok: false, error: "Lotta transfer edilecek stok yok." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(companyModulePath(companyId, "lots"));
  revalidatePath(companyModulePath(companyId, "warehouse"));
  return { ok: true };
}
