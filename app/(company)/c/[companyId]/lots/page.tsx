import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
import { getExpiryThresholds } from "@/lib/company-settings";
import {
  EXPIRY_BADGE_CLASS,
  EXPIRY_LABEL,
  daysUntil,
  expiryUrgency,
  isoDatePlusDays,
  todayIso,
  type ExpiryUrgency,
} from "@/lib/expiry";
import {
  groupLocations,
  shelfIdsOfDepot,
  type LocationOption,
} from "@/lib/locations";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  QUALITY_WRITE_ROLES,
  STOCK_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

import { updateLotStatus } from "./actions";

interface PageProps {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ skt?: string; depo?: string }>;
}

type LotRow = {
  id: string;
  lot_number: string;
  received_at: string | null;
  expiry_date: string | null;
  quantity_on_hand: number;
  unit_cost: number | null;
  currency: string | null;
  status: "quarantine" | "released" | "blocked";
  materials: { code: string; name: string; base_uom: string } | null;
  suppliers: { code: string; name: string } | null;
  customers: { code: string; name: string } | null;
  locations: { code: string; name: string; is_default: boolean } | null;
};

const STATUS_LABEL: Record<LotRow["status"], string> = {
  quarantine: "Karantina",
  released: "Serbest",
  blocked: "Bloklu",
};

const STATUS_VARIANT: Record<
  LotRow["status"],
  "default" | "secondary" | "warning" | "destructive"
> = {
  quarantine: "warning",
  released: "default",
  blocked: "destructive",
};

const STATUS_NEXT: Record<LotRow["status"], LotRow["status"][]> = {
  quarantine: ["released", "blocked"],
  released: ["blocked", "quarantine"],
  blocked: ["quarantine", "released"],
};

const SKT_FILTERS = ["expired", "critical", "warning"] as const;
type SktFilter = (typeof SKT_FILTERS)[number];

function isSktFilter(v: string | undefined): v is SktFilter {
  return !!v && (SKT_FILTERS as readonly string[]).includes(v);
}

function formatNumber(n: number): string {
  return Number(n).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

export default async function LotsListPage({ params, searchParams }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { skt: sktParam, depo: depoParam } = await searchParams;
  const { companyId, role } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const thresholds = await getExpiryThresholds(companyId);
  const sktFilter = isSktFilter(sktParam) ? sktParam : null;

  const { data: locationRows } = await supabase
    .from("locations")
    .select("id, code, name, kind, parent_id, is_default")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("code")
    .returns<LocationOption[]>();
  const allLocations = locationRows ?? [];
  const depoFilter = allLocations.find((l) => l.id === depoParam) ?? null;

  let query = supabase
    .from("material_lots")
    .select(
      "id, lot_number, received_at, expiry_date, quantity_on_hand, unit_cost, currency, status, " +
        "materials:material_id(code, name, base_uom), " +
        "suppliers:supplier_id(code, name), " +
        "customers:owner_customer_id(code, name), " +
        "locations:location_id(code, name, is_default)",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null);

  const today = todayIso();
  if (sktFilter === "expired") {
    query = query.lt("expiry_date", today).gt("quantity_on_hand", 0);
  } else if (sktFilter === "critical") {
    query = query
      .gte("expiry_date", today)
      .lte("expiry_date", isoDatePlusDays(thresholds.criticalDays))
      .gt("quantity_on_hand", 0);
  } else if (sktFilter === "warning") {
    query = query
      .gt("expiry_date", isoDatePlusDays(thresholds.criticalDays))
      .lte("expiry_date", isoDatePlusDays(thresholds.warningDays))
      .gt("quantity_on_hand", 0);
  }

  if (depoFilter) {
    const locationIds =
      depoFilter.kind === "depot"
        ? [depoFilter.id, ...shelfIdsOfDepot(allLocations, depoFilter.id)]
        : [depoFilter.id];
    query = query.in("location_id", locationIds);
  }

  const { data: lots } = await query
    .order(sktFilter ? "expiry_date" : "received_at", {
      ascending: sktFilter ? true : false,
    })
    .returns<LotRow[]>();

  const listPath = companyModulePath(companyId, "lots");
  const filterHref = (skt: SktFilter | null, depo: string | null): string => {
    const qs = new URLSearchParams();
    if (skt) qs.set("skt", skt);
    if (depo) qs.set("depo", depo);
    const s = qs.toString();
    return s ? `${listPath}?${s}` : listPath;
  };

  const canWriteStock = canWriteCompanyData(role, STOCK_WRITE_ROLES);
  const rows = lots ?? [];
  const locationGroups = groupLocations(allLocations);

  const sktPills: Array<{ key: SktFilter | null; label: string }> = [
    { key: null, label: "Tümü" },
    { key: "expired", label: EXPIRY_LABEL.expired },
    { key: "critical", label: `${EXPIRY_LABEL.critical} (≤${thresholds.criticalDays}g)` },
    { key: "warning", label: `${EXPIRY_LABEL.warning} (≤${thresholds.warningDays}g)` },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Lotlar</h1>
          <p className="text-sm text-muted-foreground">
            Lotlar: alış tarihi, son kullanma, eldeki miktar, konum ve durum.
            QC sonrası bir lotu &quot;Serbest&quot;e alarak üretime
            kullanılabilir hale getirin.
          </p>
        </div>
        {canWriteStock ? (
          <div className="flex gap-2">
            <Link href={companyModulePath(companyId, "lots", "onboarding")}>
              <Button variant="outline">Mevcut Stok Girişi</Button>
            </Link>
            <Link href={companyModulePath(companyId, "lots", "new")}>
              <Button>Yeni Lot (Mal Kabul)</Button>
            </Link>
          </div>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {sktPills.map((pill) => {
          const active = sktFilter === pill.key;
          return (
            <Link
              key={pill.label}
              href={filterHref(pill.key, depoFilter?.id ?? null)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                active
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              {pill.label}
            </Link>
          );
        })}

        <span className="mx-1 text-xs text-muted-foreground">·</span>

        <Link
          href={filterHref(sktFilter, null)}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            !depoFilter
              ? "border-primary bg-primary/10 font-medium text-primary"
              : "border-border text-muted-foreground hover:bg-secondary"
          }`}
        >
          Tüm Konumlar
        </Link>
        {locationGroups.map((group) => {
          const active = depoFilter?.id === group.depot.id;
          return (
            <Link
              key={group.depot.id}
              href={filterHref(sktFilter, group.depot.id)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                active
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              {group.depot.name}
            </Link>
          );
        })}
        {depoFilter && depoFilter.kind === "shelf" ? (
          <span className="rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            Raf: {depoFilter.code}
          </span>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Lot No</th>
                <th className="px-3 py-2 text-left font-medium">Malzeme</th>
                <th className="px-3 py-2 text-left font-medium">Tedarikçi</th>
                <th className="px-3 py-2 text-left font-medium">Konum</th>
                <th className="px-3 py-2 text-left font-medium">Alış</th>
                <th className="px-3 py-2 text-left font-medium">SKT</th>
                <th className="px-3 py-2 text-right font-medium">Eldeki</th>
                <th className="px-3 py-2 text-right font-medium">Birim Maliyet</th>
                <th className="px-3 py-2 text-left font-medium">Durum</th>
                <th className="px-3 py-2 text-left font-medium">Aksiyon</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((lot) => {
                const urgency: ExpiryUrgency | null = expiryUrgency(
                  lot.expiry_date,
                  thresholds,
                );
                const dte = daysUntil(lot.expiry_date);
                return (
                  <tr key={lot.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-mono text-xs">
                      <div className="flex flex-col gap-1">
                        <Link
                          href={`${listPath}/${lot.id}`}
                          className="hover:underline"
                        >
                          {lot.lot_number}
                        </Link>
                        {lot.customers ? (
                          <Badge variant="warning">
                            Müşteri Malı — {lot.customers.name}
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {lot.materials ? (
                        <span>
                          <span className="font-mono text-xs">
                            {lot.materials.code}
                          </span>
                          <span className="ml-1">— {lot.materials.name}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {lot.suppliers ? (
                        <span>
                          <span className="font-mono text-xs">
                            {lot.suppliers.code}
                          </span>
                          <span className="ml-1">— {lot.suppliers.name}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {lot.locations ? (
                        lot.locations.is_default ? (
                          <span className="text-muted-foreground">
                            {lot.locations.name}
                          </span>
                        ) : (
                          <Badge variant="outline">{lot.locations.code}</Badge>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {lot.received_at ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      <div className="flex flex-col gap-1">
                        <span>{lot.expiry_date ?? "—"}</span>
                        {urgency && urgency !== "ok" ? (
                          <span
                            className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${EXPIRY_BADGE_CLASS[urgency]}`}
                          >
                            {urgency === "expired"
                              ? EXPIRY_LABEL.expired
                              : `${EXPIRY_LABEL[urgency]} · ${dte}g`}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {formatNumber(Number(lot.quantity_on_hand))}{" "}
                      <span className="text-muted-foreground">
                        {lot.materials?.base_uom ?? ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {lot.unit_cost !== null
                        ? `${formatNumber(Number(lot.unit_cost))} ${lot.currency ?? ""}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_VARIANT[lot.status]}>
                        {STATUS_LABEL[lot.status]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {canWriteCompanyData(role, QUALITY_WRITE_ROLES)
                          ? STATUS_NEXT[lot.status].map((next) => (
                              <form key={next} action={updateLotStatus}>
                                <input
                                  type="hidden"
                                  name="company_id"
                                  value={companyId}
                                />
                                <input
                                  type="hidden"
                                  name="lot_id"
                                  value={lot.id}
                                />
                                <input
                                  type="hidden"
                                  name="status"
                                  value={next}
                                />
                                <button
                                  type="submit"
                                  className="rounded-sm border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:bg-secondary"
                                >
                                  {STATUS_LABEL[next]}
                                </button>
                              </form>
                            ))
                          : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : sktFilter || depoFilter ? (
        <EmptyState
          title="Filtreye uyan lot yok"
          description="Seçili son kullanma aralığında veya konumda stoklu lot bulunmuyor."
        />
      ) : (
        <EmptyState
          title="Henüz lot yok"
          description="İlk mal kabulünüzü kaydederek bir lot oluşturun. Eldeki miktar otomatik olarak stok hareketlerinden hesaplanır."
        />
      )}
    </div>
  );
}
