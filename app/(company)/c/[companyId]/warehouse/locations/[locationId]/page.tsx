import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth";
import { getExpiryThresholds } from "@/lib/company-settings";
import {
  EXPIRY_BADGE_CLASS,
  EXPIRY_LABEL,
  daysUntil,
  expiryUrgency,
} from "@/lib/expiry";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

interface PageProps {
  params: Promise<{ companyId: string; locationId: string }>;
}

type LocationDetail = {
  id: string;
  code: string;
  name: string;
  kind: "depot" | "shelf";
  is_default: boolean;
  notes: string | null;
  parent: { id: string; code: string; name: string } | null;
};

type LocationLot = {
  id: string;
  lot_number: string;
  status: "quarantine" | "released" | "blocked";
  quantity_on_hand: number;
  expiry_date: string | null;
  materials: { code: string; name: string; base_uom: string } | null;
};

const STATUS_LABEL: Record<LocationLot["status"], string> = {
  quarantine: "Karantina",
  released: "Serbest",
  blocked: "Bloklu",
};

const STATUS_VARIANT: Record<
  LocationLot["status"],
  "default" | "warning" | "destructive"
> = {
  quarantine: "warning",
  released: "default",
  blocked: "destructive",
};

function formatNumber(n: number): string {
  return Number(n).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

export default async function LocationDetailPage({ params }: PageProps) {
  const { companyId: routeCompanyId, locationId } = await params;
  const { companyId } = await requireModuleAccess(routeCompanyId, "warehouse");
  const supabase = await createServerSupabaseClient();

  const { data: location } = await supabase
    .from("locations")
    .select(
      "id, code, name, kind, is_default, notes, parent:parent_id(id, code, name)",
    )
    .eq("id", locationId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle<LocationDetail>();

  if (!location) notFound();

  const thresholds = await getExpiryThresholds(companyId);

  const [{ data: lots }, { data: shelves }] = await Promise.all([
    supabase
      .from("material_lots")
      .select(
        "id, lot_number, status, quantity_on_hand, expiry_date, " +
          "materials:material_id(code, name, base_uom)",
      )
      .eq("company_id", companyId)
      .eq("location_id", location.id)
      .is("deleted_at", null)
      .gt("quantity_on_hand", 0)
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .returns<LocationLot[]>(),
    location.kind === "depot"
      ? supabase
          .from("locations")
          .select("id, code, name")
          .eq("company_id", companyId)
          .eq("parent_id", location.id)
          .is("deleted_at", null)
          .order("code")
      : Promise.resolve({ data: null }),
  ]);

  const shelfRows = shelves ?? [];
  let shelfLotCounts = new Map<string, number>();
  if (shelfRows.length > 0) {
    const { data: shelfLots } = await supabase
      .from("material_lots")
      .select("location_id")
      .eq("company_id", companyId)
      .in(
        "location_id",
        shelfRows.map((s) => s.id),
      )
      .is("deleted_at", null)
      .gt("quantity_on_hand", 0);
    shelfLotCounts = (shelfLots ?? []).reduce((map, row) => {
      if (row.location_id) {
        map.set(row.location_id, (map.get(row.location_id) ?? 0) + 1);
      }
      return map;
    }, new Map<string, number>());
  }

  const lotRows = lots ?? [];

  return (
    <div className="max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            <Link
              href={companyModulePath(companyId, "warehouse")}
              className="hover:underline"
            >
              ← Depo Hareketleri
            </Link>
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className="font-mono">{location.code}</span> — {location.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">
              {location.kind === "shelf" ? "Raf" : "Depo"}
            </Badge>
            {location.is_default ? (
              <Badge variant="secondary">Varsayılan</Badge>
            ) : null}
            {location.parent ? (
              <span>
                <Link
                  href={companyModulePath(
                    companyId,
                    "warehouse",
                    "locations",
                    location.parent.id,
                  )}
                  className="hover:underline"
                >
                  {location.parent.code} — {location.parent.name}
                </Link>{" "}
                içinde
              </span>
            ) : null}
          </div>
        </div>
        <Link
          href={companyModulePath(
            companyId,
            "warehouse",
            "locations",
            location.id,
            "label",
          )}
        >
          <Button variant="outline">Etiket Yazdır (QR)</Button>
        </Link>
      </header>

      {shelfRows.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Raflar</h2>
          <div className="flex flex-wrap gap-2">
            {shelfRows.map((shelf) => (
              <Link
                key={shelf.id}
                href={companyModulePath(
                  companyId,
                  "warehouse",
                  "locations",
                  shelf.id,
                )}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-secondary/40"
              >
                <span className="font-mono text-xs">{shelf.code}</span> —{" "}
                {shelf.name}{" "}
                <span className="text-xs text-muted-foreground">
                  ({shelfLotCounts.get(shelf.id) ?? 0} lot)
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          Bu Konumdaki Lotlar ({lotRows.length})
        </h2>
        {lotRows.length === 0 ? (
          <p className="rounded-md border border-border px-3 py-4 text-sm text-muted-foreground">
            Bu konumda stoklu lot yok.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Lot No</th>
                  <th className="px-3 py-2 text-left font-medium">Ürün</th>
                  <th className="px-3 py-2 text-right font-medium">Eldeki</th>
                  <th className="px-3 py-2 text-left font-medium">SKT</th>
                  <th className="px-3 py-2 text-left font-medium">Durum</th>
                </tr>
              </thead>
              <tbody>
                {lotRows.map((lot) => {
                  const urgency = expiryUrgency(lot.expiry_date, thresholds);
                  const dte = daysUntil(lot.expiry_date);
                  return (
                    <tr key={lot.id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">
                        <Link
                          href={`${companyModulePath(companyId, "lots")}/${lot.id}`}
                          className="hover:underline"
                        >
                          {lot.lot_number}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {lot.materials ? (
                          <span>
                            <span className="font-mono">
                              {lot.materials.code}
                            </span>{" "}
                            — {lot.materials.name}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {formatNumber(Number(lot.quantity_on_hand))}{" "}
                        <span className="text-muted-foreground">
                          {lot.materials?.base_uom ?? ""}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">
                            {lot.expiry_date ?? "—"}
                          </span>
                          {urgency && urgency !== "ok" ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${EXPIRY_BADGE_CLASS[urgency]}`}
                            >
                              {EXPIRY_LABEL[urgency]}
                              {urgency !== "expired" && dte !== null
                                ? ` · ${dte}g`
                                : ""}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={STATUS_VARIANT[lot.status]}>
                          {STATUS_LABEL[lot.status]}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {location.notes ? (
        <section className="rounded-md border border-border p-4">
          <h2 className="mb-2 text-sm font-medium">Notlar</h2>
          <p className="whitespace-pre-wrap text-sm">{location.notes}</p>
        </section>
      ) : null}
    </div>
  );
}
