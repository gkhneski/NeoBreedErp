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
  expiry_date: string | null;
  material_code: string;
  material_name: string;
  base_uom: string;
  location_id: string | null;
  location_name: string | null;
  customer_owned_by: string | null;
};

export type ScannedLocationLot = {
  id: string;
  lot_number: string;
  status: "quarantine" | "released" | "blocked";
  quantity_on_hand: number;
  expiry_date: string | null;
  material_name: string;
  base_uom: string;
};

export type ScannedLocation = {
  id: string;
  code: string;
  name: string;
  kind: "depot" | "shelf";
  parent_name: string | null;
  lots: ScannedLocationLot[];
};

export type ScanResolution =
  | { ok: true; kind: "lot"; lot: ScannedLot }
  | { ok: true; kind: "location"; location: ScannedLocation }
  | { ok: false; error: string };

type SupabaseServerClient = Awaited<
  ReturnType<typeof createServerSupabaseClient>
>;

async function resolveLot(
  supabase: SupabaseServerClient,
  companyId: string,
  by: { lotId?: string; lotNumber?: string },
  onlyFinished = false,
): Promise<ScannedLot | null> {
  let q = supabase
    .from("material_lots")
    .select(
      "id, lot_number, status, quantity_on_hand, expiry_date, location_id, " +
        `materials:material_id${onlyFinished ? "!inner" : ""}(code, name, base_uom, type), ` +
        "customers:owner_customer_id(name), " +
        "locations:location_id(name)",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null);
  if (onlyFinished) q = q.eq("materials.type", "finished");
  q = by.lotId ? q.eq("id", by.lotId) : q.eq("lot_number", by.lotNumber!);

  const { data: lot } = await q.limit(1).maybeSingle<{
    id: string;
    lot_number: string;
    status: "quarantine" | "released" | "blocked";
    quantity_on_hand: number;
    expiry_date: string | null;
    location_id: string | null;
    materials: { code: string; name: string; base_uom: string } | null;
    customers: { name: string } | null;
    locations: { name: string } | null;
  }>();

  if (!lot) return null;

  return {
    id: lot.id,
    lot_number: lot.lot_number,
    status: lot.status,
    quantity_on_hand: Number(lot.quantity_on_hand),
    expiry_date: lot.expiry_date,
    material_code: lot.materials?.code ?? "",
    material_name: lot.materials?.name ?? "",
    base_uom: lot.materials?.base_uom ?? "",
    location_id: lot.location_id,
    location_name: lot.locations?.name ?? null,
    customer_owned_by: lot.customers?.name ?? null,
  };
}

async function resolveLocation(
  supabase: SupabaseServerClient,
  companyId: string,
  by: { locationId?: string; code?: string },
  onlyFinished = false,
): Promise<ScannedLocation | null> {
  let q = supabase
    .from("locations")
    .select("id, code, name, kind, parent:parent_id(name)")
    .eq("company_id", companyId)
    .is("deleted_at", null);
  q = by.locationId ? q.eq("id", by.locationId) : q.eq("code", by.code!);

  const { data: location } = await q.limit(1).maybeSingle<{
    id: string;
    code: string;
    name: string;
    kind: "depot" | "shelf";
    parent: { name: string } | null;
  }>();

  if (!location) return null;

  let lotsQuery = supabase
    .from("material_lots")
    .select(
      "id, lot_number, status, quantity_on_hand, expiry_date, " +
        `materials:material_id${onlyFinished ? "!inner" : ""}(name, base_uom, type)`,
    )
    .eq("company_id", companyId)
    .eq("location_id", location.id)
    .gt("quantity_on_hand", 0)
    .is("deleted_at", null);
  if (onlyFinished) lotsQuery = lotsQuery.eq("materials.type", "finished");
  const { data: lots } = await lotsQuery
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .returns<
      Array<{
        id: string;
        lot_number: string;
        status: "quarantine" | "released" | "blocked";
        quantity_on_hand: number;
        expiry_date: string | null;
        materials: { name: string; base_uom: string } | null;
      }>
    >();

  return {
    id: location.id,
    code: location.code,
    name: location.name,
    kind: location.kind,
    parent_name: location.parent?.name ?? null,
    lots: (lots ?? []).map((l) => ({
      id: l.id,
      lot_number: l.lot_number,
      status: l.status,
      quantity_on_hand: Number(l.quantity_on_hand),
      expiry_date: l.expiry_date,
      material_name: l.materials?.name ?? "",
      base_uom: l.materials?.base_uom ?? "",
    })),
  };
}

export async function resolveScan(
  routeCompanyId: string,
  query: string,
): Promise<ScanResolution> {
  const { companyId, role } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();
  // Depo personeli yalnizca bitmis urun lot/konumlarini okutabilir.
  const onlyFinished = role === "operator";

  const trimmed = query.trim();
  if (!trimmed) return { ok: false, error: "Okutulan kod boş." };

  if (trimmed.startsWith("http")) {
    const locationMatch = trimmed.match(
      /\/c\/([0-9a-f-]{36})\/warehouse\/locations\/([0-9a-f-]{36})/i,
    );
    if (locationMatch) {
      if (locationMatch[1].toLowerCase() !== companyId.toLowerCase()) {
        return { ok: false, error: "Bu etiket başka bir firmaya ait." };
      }
      const location = await resolveLocation(
        supabase,
        companyId,
        { locationId: locationMatch[2] },
        onlyFinished,
      );
      if (!location) return { ok: false, error: "Konum bulunamadı." };
      return { ok: true, kind: "location", location };
    }

    const lotMatch = trimmed.match(
      /\/c\/([0-9a-f-]{36})\/lots\/([0-9a-f-]{36})/i,
    );
    if (!lotMatch) {
      return { ok: false, error: "QR kodu bir lot veya konum etiketi değil." };
    }
    if (lotMatch[1].toLowerCase() !== companyId.toLowerCase()) {
      return { ok: false, error: "Bu etiket başka bir firmaya ait." };
    }
    const lot = await resolveLot(
      supabase,
      companyId,
      { lotId: lotMatch[2] },
      onlyFinished,
    );
    if (!lot) return { ok: false, error: "Lot bulunamadı." };
    return { ok: true, kind: "lot", lot };
  }

  if (uuidRegex.test(trimmed)) {
    const lot = await resolveLot(
      supabase,
      companyId,
      { lotId: trimmed },
      onlyFinished,
    );
    if (!lot) return { ok: false, error: "Lot bulunamadı." };
    return { ok: true, kind: "lot", lot };
  }

  const lot = await resolveLot(
    supabase,
    companyId,
    { lotNumber: trimmed },
    onlyFinished,
  );
  if (lot) return { ok: true, kind: "lot", lot };

  const location = await resolveLocation(
    supabase,
    companyId,
    { code: trimmed.toUpperCase() },
    onlyFinished,
  );
  if (location) return { ok: true, kind: "location", location };

  return { ok: false, error: "Lot veya konum bulunamadı." };
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

  const { companyId, role } = await requireCompanyRole(
    parsed.data.company_id,
    STOCK_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  if (role === "operator") {
    const { data: lot } = await supabase
      .from("material_lots")
      .select("id, materials:material_id!inner(type)")
      .eq("id", parsed.data.lot_id)
      .eq("company_id", companyId)
      .eq("materials.type", "finished")
      .is("deleted_at", null)
      .maybeSingle();
    if (!lot) {
      return { ok: false, error: "Bu lot depo personeli tarafından işlenemez." };
    }
  }

  const { error } = await supabase.rpc("transfer_lot", {
    p_company_id: companyId,
    p_lot_id: parsed.data.lot_id,
    p_to_location_id: parsed.data.to_location_id,
    p_notes: "barcode scan receipt",
  });

  if (error) {
    if (error.message.includes("blocked lots")) {
      return { ok: false, error: "Bloklu lotlar transfer edilemez." };
    }
    if (error.message.includes("already at the target")) {
      return { ok: false, error: "Bu lot zaten hedef konumda." };
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
