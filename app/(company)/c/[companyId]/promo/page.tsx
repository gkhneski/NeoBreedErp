import { requireModuleAccess } from "@/lib/auth";
import { findSalesDepot } from "@/lib/sales-depot";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STOCK_WRITE_ROLES, canWriteCompanyData } from "@/types/roles";

import { PromoClient, type PromoItem } from "./promo-client";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type MaterialRow = { id: string; code: string; name: string; barcode: string | null };
type LotRow = {
  id: string;
  material_id: string;
  lot_number: string;
  quantity_on_hand: number;
  notes: string | null;
  created_at: string;
};

export default async function PromoPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireModuleAccess(routeCompanyId, "promo");
  const supabase = await createServerSupabaseClient();

  const [{ data: materials }, { data: lots }, depot] = await Promise.all([
    supabase
      .from("materials")
      .select("id, code, name, barcode")
      .eq("company_id", companyId)
      .eq("type", "promo")
      .is("deleted_at", null)
      .order("code")
      .returns<MaterialRow[]>(),
    supabase
      .from("material_lots")
      .select(
        "id, material_id, lot_number, quantity_on_hand, notes, created_at, materials:material_id!inner(type)",
      )
      .eq("company_id", companyId)
      .eq("materials.type", "promo")
      .is("deleted_at", null)
      .gt("quantity_on_hand", 0)
      .order("created_at", { ascending: false })
      .returns<LotRow[]>(),
    findSalesDepot(supabase, companyId),
  ]);

  const lotRows = lots ?? [];
  const items: PromoItem[] = (materials ?? []).map((m) => {
    const own = lotRows.filter((l) => l.material_id === m.id);
    return {
      ...m,
      total: own.reduce((s, l) => s + Number(l.quantity_on_hand), 0),
      lots: own.map((l) => ({
        id: l.id,
        lot_number: l.lot_number,
        quantity_on_hand: Number(l.quantity_on_hand),
        notes: l.notes,
        created_at: l.created_at,
      })),
    };
  });

  return (
    <PromoClient
      companyId={companyId}
      items={items}
      depotName={depot?.name ?? null}
      canWrite={canWriteCompanyData(role, STOCK_WRITE_ROLES)}
    />
  );
}
