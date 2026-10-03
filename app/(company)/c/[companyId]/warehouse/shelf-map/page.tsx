import { Printer, ScanLine } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
import { findSalesDepot } from "@/lib/sales-depot";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uomLabel } from "@/lib/uom";
import { companyModulePath } from "@/types/roles";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type ShelfRow = { id: string; code: string; name: string };
type LotRow = {
  id: string;
  lot_number: string;
  quantity_on_hand: number;
  status: "quarantine" | "released" | "blocked";
  expiry_date: string | null;
  location_id: string | null;
  material_id: string;
  materials: { code: string; name: string; base_uom: string; type: string } | null;
};

type ProductOnShelf = {
  material_id: string;
  code: string;
  name: string;
  uom: string;
  promo: boolean;
  qty: number;
  lots: number;
};

function groupByProduct(lots: LotRow[]): ProductOnShelf[] {
  const map = new Map<string, ProductOnShelf>();
  for (const lot of lots) {
    const cur = map.get(lot.material_id);
    if (cur) {
      cur.qty += Number(lot.quantity_on_hand);
      cur.lots += 1;
    } else {
      map.set(lot.material_id, {
        material_id: lot.material_id,
        code: lot.materials?.code ?? "",
        name: lot.materials?.name ?? "—",
        uom: lot.materials?.base_uom ?? "",
        promo: lot.materials?.type === "promo",
        qty: Number(lot.quantity_on_hand),
        lots: 1,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

const STATUS_LABEL: Record<LotRow["status"], string> = {
  quarantine: "Karantina",
  released: "Serbest",
  blocked: "Bloklu",
};

export default async function ShelfMapPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const depot = await findSalesDepot(supabase, companyId);
  if (!depot) {
    return (
      <div className="space-y-6">
        <Header companyId={companyId} depotName={null} />
        <EmptyState
          title="Satış deposu tanımlı değil"
          description="Ayarlar → Konumlar'dan varsayılan olmayan bir depo (LTD) ve raflarını ekleyin."
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
    .order("code")
    .returns<ShelfRow[]>();
  const shelfRows = shelves ?? [];
  const locationIds = [depot.id, ...shelfRows.map((s) => s.id)];

  const { data: lots } = await supabase
    .from("material_lots")
    .select(
      "id, lot_number, quantity_on_hand, status, expiry_date, location_id, material_id, " +
        "materials:material_id!inner(code, name, base_uom, type)",
    )
    .eq("company_id", companyId)
    .in("location_id", locationIds)
    .in("materials.type", ["finished", "promo"])
    .is("deleted_at", null)
    .gt("quantity_on_hand", 0)
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .returns<LotRow[]>();
  const lotRows = lots ?? [];

  const unshelved = lotRows.filter((l) => l.location_id === depot.id);
  const byShelf = new Map<string, LotRow[]>();
  for (const lot of lotRows) {
    if (lot.location_id && lot.location_id !== depot.id) {
      const arr = byShelf.get(lot.location_id) ?? [];
      arr.push(lot);
      byShelf.set(lot.location_id, arr);
    }
  }
  const emptyShelves = shelfRows.filter((s) => !byShelf.has(s.id));
  const scanPath = companyModulePath(companyId, "warehouse", "scan");

  return (
    <div className="space-y-6">
      <Header companyId={companyId} depotName={depot.name} />

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-md border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Raf</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {shelfRows.length}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {emptyShelves.length} boş
            </span>
          </p>
        </article>
        <article className="rounded-md border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Raftaki Lot</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {lotRows.length - unshelved.length}
          </p>
        </article>
        <article
          className={`rounded-md border p-4 ${
            unshelved.length > 0 ? "border-amber-300 bg-amber-50" : "border-border bg-card"
          }`}
        >
          <p className="text-xs text-muted-foreground">Rafsız Lot</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{unshelved.length}</p>
        </article>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-semibold">Rafsız Lotlar</h2>
          <p className="text-xs text-muted-foreground">
            Depoya alınmış ama rafa konmamış. Barkod Tara&apos;da lotu okutup raf etiketini
            okutun.
          </p>
        </div>
        {unshelved.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            Rafsız lot yok. Her şey yerinde.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-amber-200">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-amber-50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Lot</th>
                  <th className="px-3 py-2 text-left font-medium">Ürün</th>
                  <th className="px-3 py-2 text-right font-medium">Adet</th>
                  <th className="px-3 py-2 text-left font-medium">SKT</th>
                  <th className="px-3 py-2 text-left font-medium">Durum</th>
                  <th className="px-3 py-2 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {unshelved.map((lot) => (
                  <tr key={lot.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link
                        href={companyModulePath(companyId, "lots", lot.id)}
                        className="hover:underline"
                      >
                        {lot.lot_number}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {lot.materials?.name ?? "—"}
                      {lot.materials?.type === "promo" ? (
                        <Badge variant="secondary" className="ml-2">
                          Promosyon
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {Number(lot.quantity_on_hand).toLocaleString("tr-TR")}{" "}
                      {uomLabel(lot.materials?.base_uom)}
                    </td>
                    <td className="px-3 py-2 text-xs">{lot.expiry_date ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{STATUS_LABEL[lot.status]}</td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`${scanPath}?lot=${lot.id}`}>
                        <Button size="sm" variant="outline">
                          <ScanLine className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                          Rafa Koy
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Raflar</h2>
        {shelfRows.length === 0 ? (
          <EmptyState
            title="Bu depoda raf tanımlı değil"
            description="Yönetici Ayarlar → Konumlar'dan LTD deposuna raf ekleyip etiketlerini yazdırır."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shelfRows.map((shelf) => {
              const products = groupByProduct(byShelf.get(shelf.id) ?? []);
              const total = products.reduce((s, p) => s + p.qty, 0);
              return (
                <article
                  key={shelf.id}
                  className="flex flex-col rounded-md border border-border bg-card"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
                    <div>
                      <Link
                        href={companyModulePath(companyId, "warehouse", "locations", shelf.id)}
                        className="font-mono text-sm font-semibold hover:underline"
                      >
                        {shelf.code}
                      </Link>
                      <p className="text-xs text-muted-foreground">{shelf.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {products.length > 0 ? (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {total.toLocaleString("tr-TR")} adet
                        </span>
                      ) : (
                        <Badge variant="outline">Boş</Badge>
                      )}
                      <Link
                        href={companyModulePath(companyId, "warehouse", "locations", shelf.id, "label")}
                        aria-label={`${shelf.code} raf etiketi`}
                        className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <Printer className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                  {products.length > 0 ? (
                    <ul className="divide-y divide-border/60 px-4 text-sm">
                      {products.map((p) => (
                        <li key={p.material_id} className="flex items-center justify-between gap-3 py-2">
                          <span className="min-w-0 truncate">
                            <span className="font-mono text-xs text-muted-foreground">{p.code}</span>{" "}
                            {p.name}
                            {p.promo ? (
                              <span className="ml-1 text-xs text-muted-foreground">(promosyon)</span>
                            ) : null}
                          </span>
                          <span className="shrink-0 font-mono text-xs tabular-nums">
                            {p.qty.toLocaleString("tr-TR")} {uomLabel(p.uom)}
                            <span className="ml-1 text-muted-foreground">· {p.lots} lot</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-4 py-3 text-xs text-muted-foreground">
                      Bu rafta ürün yok.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Header({ companyId, depotName }: { companyId: string; depotName: string | null }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          <Link href={companyModulePath(companyId, "warehouse")} className="hover:underline">
            ← Depo Hareketleri
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Raf Haritası</h1>
        <p className="text-sm text-muted-foreground">
          {depotName ? `${depotName}: ` : ""}hangi ürün hangi rafta, rafsız lotlar ve boş raflar.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={companyModulePath(companyId, "warehouse", "scan")}>
          <Button>
            <ScanLine className="mr-1 h-4 w-4" aria-hidden="true" />
            Barkod Tara
          </Button>
        </Link>
        <Link href={companyModulePath(companyId, "warehouse", "locations", "labels")}>
          <Button variant="outline">
            <Printer className="mr-1 h-4 w-4" aria-hidden="true" />
            Raf Etiketleri
          </Button>
        </Link>
      </div>
    </header>
  );
}
