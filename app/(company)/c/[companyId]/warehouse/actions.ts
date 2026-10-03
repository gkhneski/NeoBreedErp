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
  if (onlyFinished) q = q.in("materials.type", ["finished", "promo"]);
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
  if (onlyFinished) lotsQuery = lotsQuery.in("materials.type", ["finished", "promo"]);
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

function transferErrorMessage(message: string): string {
  if (message.includes("blocked lots")) return "Bloklu lotlar transfer edilemez.";
  if (message.includes("already at the target")) return "Bu lot zaten hedef konumda.";
  if (message.includes("no stock on hand")) return "Lotta transfer edilecek stok yok.";
  return message;
}

// Raf, bağlı olduğu deponun; konumsuz lot varsayılan deponun içindedir.
async function isCrossDepot(
  supabase: SupabaseServerClient,
  companyId: string,
  lotLocationId: string | null,
  toLocationId: string,
): Promise<boolean> {
  const { data: locations } = await supabase
    .from("locations")
    .select("id, kind, parent_id, is_default")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .returns<
      Array<{
        id: string;
        kind: "depot" | "shelf";
        parent_id: string | null;
        is_default: boolean;
      }>
    >();
  const rows = locations ?? [];
  const depotOf = (id: string | null) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return rows.find((r) => r.is_default)?.id ?? null;
    return row.kind === "shelf" ? row.parent_id : row.id;
  };
  return depotOf(lotLocationId) !== depotOf(toLocationId);
}

async function loadLotForMove(
  supabase: SupabaseServerClient,
  companyId: string,
  lotId: string,
  onlyFinished: boolean,
): Promise<{ quantity_on_hand: number; location_id: string | null } | null> {
  let q = supabase
    .from("material_lots")
    .select(
      "id, quantity_on_hand, location_id, materials:material_id!inner(type)",
    )
    .eq("id", lotId)
    .eq("company_id", companyId)
    .is("deleted_at", null);
  if (onlyFinished) q = q.in("materials.type", ["finished", "promo"]);
  const { data } = await q.maybeSingle<{
    quantity_on_hand: number;
    location_id: string | null;
  }>();
  return data ?? null;
}

const scanReceiveSchema = z.object({
  company_id: z.string().uuid(),
  lot_id: z.string().uuid(),
  to_location_id: z.string().uuid(),
  counted: z.number().positive().max(100_000_000),
  note: z.string().trim().max(500),
});

export type ScanReceiveResult =
  | { ok: true; expected: number; counted: number }
  | { ok: false; error: string };

// Depo kabul: lot başka bir depoya sayılarak alınır. Sayılan miktar stoktur;
// fark varsa açıklamasıyla birlikte düzeltme hareketi olarak kayda geçer.
export async function scanReceiveLot(
  companyIdInput: string,
  lotIdInput: string,
  toLocationIdInput: string,
  countedInput: number,
  noteInput: string,
): Promise<ScanReceiveResult> {
  const parsed = scanReceiveSchema.safeParse({
    company_id: companyIdInput,
    lot_id: lotIdInput,
    to_location_id: toLocationIdInput,
    counted: countedInput,
    note: noteInput,
  });
  if (!parsed.success) {
    return { ok: false, error: "Sayılan miktar geçersiz." };
  }

  const { companyId, role } = await requireCompanyRole(
    parsed.data.company_id,
    STOCK_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const lot = await loadLotForMove(
    supabase,
    companyId,
    parsed.data.lot_id,
    role === "operator",
  );
  if (!lot) {
    return {
      ok: false,
      error:
        role === "operator"
          ? "Bu lot depo personeli tarafından işlenemez."
          : "Lot bulunamadı.",
    };
  }

  const expected = Number(lot.quantity_on_hand);
  if (parsed.data.counted !== expected && parsed.data.note === "") {
    return {
      ok: false,
      error: "Sayım sistemdeki miktardan farklı; farkın nedenini yazın.",
    };
  }

  const { error } = await supabase.rpc("receive_lot_counted", {
    p_company_id: companyId,
    p_lot_id: parsed.data.lot_id,
    p_to_location_id: parsed.data.to_location_id,
    p_counted_quantity: parsed.data.counted,
    p_notes: parsed.data.note || null,
  });
  if (error) return { ok: false, error: transferErrorMessage(error.message) };

  revalidatePath(companyModulePath(companyId, "lots"));
  revalidatePath(companyModulePath(companyId, "warehouse"));
  revalidatePath(companyModulePath(companyId, "stock"));
  return { ok: true, expected, counted: parsed.data.counted };
}

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

  const lot = await loadLotForMove(
    supabase,
    companyId,
    parsed.data.lot_id,
    role === "operator",
  );
  if (!lot) {
    return {
      ok: false,
      error:
        role === "operator"
          ? "Bu lot depo personeli tarafından işlenemez."
          : "Lot bulunamadı.",
    };
  }

  // Depolar arası alım sayımsız yapılamaz; bu yol yalnızca depo içi yerleştirme.
  if (
    await isCrossDepot(
      supabase,
      companyId,
      lot.location_id,
      parsed.data.to_location_id,
    )
  ) {
    return { ok: false, error: "Başka depoya alırken ürünü sayıp miktarı girin." };
  }

  const { error } = await supabase.rpc("transfer_lot", {
    p_company_id: companyId,
    p_lot_id: parsed.data.lot_id,
    p_to_location_id: parsed.data.to_location_id,
    p_notes: "barcode scan receipt",
  });

  if (error) return { ok: false, error: transferErrorMessage(error.message) };

  revalidatePath(companyModulePath(companyId, "lots"));
  revalidatePath(companyModulePath(companyId, "warehouse"));
  return { ok: true };
}
