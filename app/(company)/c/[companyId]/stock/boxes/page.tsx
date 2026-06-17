import Link from "next/link";

import { requireModuleAccess } from "@/lib/auth";
import { parsePack, unitsPerPack } from "@/lib/production/pack";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  STOCK_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

import { BoxesClient, type LotRow, type PackRow } from "./boxes-client";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function BoxesToolPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireModuleAccess(routeCompanyId, "stock");
  const supabase = await createServerSupabaseClient();

  const { data: materials } = await supabase
    .from("materials")
    .select("id, name, units_per_pack")
    .eq("company_id", companyId)
    .eq("type", "finished")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .returns<Array<{ id: string; name: string; units_per_pack: number }>>();

  const mats = materials ?? [];
  const matIds = mats.map((m) => m.id);

  const { data: lots } = matIds.length
    ? await supabase
        .from("material_lots")
        .select(
          "id, lot_number, quantity_on_hand, status, material_id, " +
            "location:location_id(name)",
        )
        .eq("company_id", companyId)
        .in("material_id", matIds)
        .is("deleted_at", null)
        .gt("quantity_on_hand", 0)
        .returns<
          Array<{
            id: string;
            lot_number: string;
            quantity_on_hand: number;
            status: string;
            material_id: string;
            location: { name: string } | null;
          }>
        >()
    : { data: [] as never[] };

  const matById = new Map(mats.map((m) => [m.id, m]));

  const packRows: PackRow[] = mats.map((m) => {
    const auto = unitsPerPack(m.name);
    const stored = Number(m.units_per_pack) || 1;
    return {
      materialId: m.id,
      name: m.name,
      stored,
      auto,
      kind: parsePack(m.name).kind,
      suggested: stored > 1 ? stored : auto,
    };
  });

  const lotRows: LotRow[] = (lots ?? []).map((l) => {
    const m = matById.get(l.material_id);
    const pack = m ? unitsPerPack(m.name) : 1;
    const qty = Number(l.quantity_on_hand);
    const boxes = pack > 1 ? qty / pack : qty;
    const clean = pack > 1 && Number.isInteger(boxes);
    return {
      lotId: l.id,
      lotNumber: l.lot_number,
      productName: m?.name ?? "—",
      location: l.location?.name ?? "—",
      currentQty: qty,
      pack,
      boxes,
      convertible: pack > 1,
      clean,
    };
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href={companyModulePath(companyId, "stock")} className="hover:underline">
            Stok
          </Link>
          <span>/</span>
          <span>Kutu Birimi</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Kutu Birimine Geçiş</h1>
        <p className="text-sm text-muted-foreground">
          Bitmiş ürünler depoya kutu olarak alınır. Paket boyu üründen otomatik
          okunur; önce kaydedin, sonra mevcut tablet-cinsi stokları kutuya çevirin.
        </p>
      </header>

      <BoxesClient
        companyId={companyId}
        canManage={canWriteCompanyData(role, STOCK_WRITE_ROLES)}
        packRows={packRows}
        lotRows={lotRows}
      />
    </div>
  );
}
