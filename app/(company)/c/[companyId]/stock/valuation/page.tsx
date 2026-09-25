import Link from "next/link";

import { requireModuleAccess } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  STOCK_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

import { ValuationClient, type MaterialGroup } from "./valuation-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type LotRow = {
  id: string;
  lot_number: string;
  quantity_on_hand: number;
  received_at: string;
  material_id: string;
  materials: {
    code: string;
    name: string;
    type: "raw" | "semi" | "finished";
    base_uom: string;
  } | null;
};

type PricedLotRow = {
  material_id: string;
  unit_cost: number;
  currency: string | null;
  received_at: string;
};

function groupOf(
  code: string,
  type: "raw" | "semi" | "finished",
): MaterialGroup["group"] {
  if (type === "finished") return "finished";
  if (type === "semi") return "semi";
  return /^(AMB|PKG)-/i.test(code) ? "packaging" : "raw";
}

export default async function StockValuationPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireModuleAccess(routeCompanyId, "stock");
  const supabase = await createServerSupabaseClient();

  const [{ data: lots }, { data: priced }] = await Promise.all([
    supabase
      .from("material_lots")
      .select(
        "id, lot_number, quantity_on_hand, received_at, material_id, " +
          "materials:material_id(code, name, type, base_uom)",
      )
      .eq("company_id", companyId)
      .is("unit_cost", null)
      .is("owner_customer_id", null)
      .is("deleted_at", null)
      .gt("quantity_on_hand", 0)
      .order("received_at", { ascending: true })
      .returns<LotRow[]>(),
    supabase
      .from("material_lots")
      .select("material_id, unit_cost, currency, received_at")
      .eq("company_id", companyId)
      .not("unit_cost", "is", null)
      .is("deleted_at", null)
      .order("received_at", { ascending: false })
      .returns<PricedLotRow[]>(),
  ]);

  // Aynı malzemenin fiyatlı en güncel lotu öneri olarak gösterilir.
  const hint = new Map<string, { unitCost: number; currency: string }>();
  for (const p of priced ?? []) {
    if (!hint.has(p.material_id)) {
      hint.set(p.material_id, {
        unitCost: Number(p.unit_cost),
        currency: p.currency ?? "TRY",
      });
    }
  }

  const byMaterial = new Map<string, MaterialGroup>();
  for (const l of lots ?? []) {
    if (!l.materials) continue;
    let g = byMaterial.get(l.material_id);
    if (!g) {
      const h = hint.get(l.material_id);
      g = {
        materialId: l.material_id,
        code: l.materials.code,
        name: l.materials.name,
        uom: l.materials.base_uom,
        group: groupOf(l.materials.code, l.materials.type),
        totalQty: 0,
        lots: [],
        hintCost: h?.unitCost ?? null,
        hintCurrency: h?.currency ?? null,
      };
      byMaterial.set(l.material_id, g);
    }
    g.totalQty += Number(l.quantity_on_hand);
    g.lots.push({
      id: l.id,
      lotNumber: l.lot_number,
      qty: Number(l.quantity_on_hand),
      receivedAt: l.received_at,
    });
  }

  const groups = [...byMaterial.values()].sort((a, b) =>
    a.code.localeCompare(b.code, "tr"),
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href={companyModulePath(companyId, "stock")} className="hover:underline">
            Stok
          </Link>
          <span>/</span>
          <span>Stok Değerleme</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Stok Değerleme</h1>
        <p className="text-sm text-muted-foreground">
          Maliyeti girilmemiş lotlar (başlangıç stoku, fiyatsız mal kabul).
          Malzeme başına birim maliyet girin; o malzemenin tüm maliyetsiz
          lotlarına yazılır. Üretim maliyeti, tüketilen lotun birim
          maliyetinden hesaplanır; maliyetsiz lot parti maliyetine girmez.
        </p>
      </header>

      <ValuationClient
        companyId={companyId}
        canManage={canWriteCompanyData(role, STOCK_WRITE_ROLES)}
        groups={groups}
      />
    </div>
  );
}
