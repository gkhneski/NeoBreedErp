import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyRole } from "@/lib/auth";
import { findSalesDepot } from "@/lib/sales-depot";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STOCK_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { DepotLotFixClient, type FixLot } from "./fix-client";

interface PageProps {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ urun?: string; lot?: string }>;
}

type LotRow = {
  id: string;
  lot_number: string;
  quantity_on_hand: number;
  status: "quarantine" | "released" | "blocked";
  expiry_date: string | null;
  location_id: string | null;
  material_id: string;
  created_at: string;
  materials: {
    code: string;
    name: string;
    base_uom: string;
    type: string;
    barcode: string | null;
  } | null;
};

export default async function DepotLotFixPage({ params, searchParams }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { urun, lot: lotParam } = await searchParams;
  const { companyId } = await requireCompanyRole(routeCompanyId, STOCK_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  const depot = await findSalesDepot(supabase, companyId);
  if (!depot) {
    return (
      <div className="space-y-6">
        <Header companyId={companyId} />
        <EmptyState
          title="Satış deposu tanımlı değil"
          description="Ayarlar → Konumlar'dan varsayılan olmayan bir depo (LTD) ekleyin."
        />
      </div>
    );
  }

  const { data: shelves } = await supabase
    .from("locations")
    .select("id, code, name")
    .eq("company_id", companyId)
    .eq("kind", "shelf")
    .eq("parent_id", depot.id)
    .is("deleted_at", null)
    .returns<{ id: string; code: string; name: string }[]>();
  const locationName = new Map<string, string>([[depot.id, depot.name]]);
  for (const s of shelves ?? []) locationName.set(s.id, s.code);

  const { data: lots } = await supabase
    .from("material_lots")
    .select(
      "id, lot_number, quantity_on_hand, status, expiry_date, location_id, material_id, created_at, " +
        "materials:material_id!inner(code, name, base_uom, type, barcode)",
    )
    .eq("company_id", companyId)
    .in("location_id", Array.from(locationName.keys()))
    .in("materials.type", ["finished", "promo"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1000)
    .returns<LotRow[]>();

  const rows: FixLot[] = (lots ?? []).map((l) => ({
    id: l.id,
    materialId: l.material_id,
    lotNumber: l.lot_number,
    quantity: Number(l.quantity_on_hand),
    status: l.status,
    expiryDate: l.expiry_date,
    location: l.location_id ? (locationName.get(l.location_id) ?? null) : null,
    createdAt: l.created_at,
    productCode: l.materials?.code ?? "",
    productName: l.materials?.name ?? "—",
    barcode: l.materials?.barcode ?? null,
    uom: l.materials?.base_uom ?? "",
    promo: l.materials?.type === "promo",
  }));

  return (
    <div className="space-y-6">
      <Header companyId={companyId} />
      {rows.length === 0 ? (
        <EmptyState
          title="Depoda lot yok"
          description="Satış deposunda düzeltilecek bitmiş ürün veya promosyon lotu bulunmuyor."
        />
      ) : (
        <DepotLotFixClient
          companyId={companyId}
          lots={rows}
          initialProductId={rows.some((r) => r.materialId === urun) ? (urun ?? null) : null}
          initialOpenId={rows.some((r) => r.id === lotParam) ? (lotParam ?? null) : null}
        />
      )}
    </div>
  );
}

function Header({ companyId }: { companyId: string }) {
  return (
    <header className="space-y-2">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        <Link href={companyModulePath(companyId)} className="hover:underline">
          ← Depo Paneli
        </Link>
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Stok Düzelt</h1>
      <p className="text-sm text-muted-foreground">
        Yanlış girilen adet, lot no veya SKT&apos;yi düzeltin; yanlış ürünle açılan
        girişi silin. Her düzeltme nedeniyle birlikte{" "}
        <Link
          href={companyModulePath(companyId, "warehouse", "log")}
          className="underline"
        >
          protokole
        </Link>{" "}
        yazılır.
      </p>
    </header>
  );
}
