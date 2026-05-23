import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireCompanyUser } from "@/lib/auth";
import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
  normalizeSupportedCurrency,
} from "@/lib/currencies";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type CostBatchRow = {
  cost_total: number | null;
  cost_currency: string | null;
  completed_at: string | null;
};

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-md border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </article>
  );
}

function CostCard({
  label,
  amount,
  currency,
  sublabel,
}: {
  label: string;
  amount: number | null;
  currency: string;
  sublabel?: string;
}) {
  const formatted =
    amount === null
      ? "—"
      : amount.toLocaleString("tr-TR", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        });
  return (
    <article className="rounded-md border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {formatted}
        {amount !== null ? (
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            {currency}
          </span>
        ) : null}
      </p>
      {sublabel ? (
        <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
      ) : null}
    </article>
  );
}

export default async function ReportsPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const [
    { count: materialCount },
    { count: productCount },
    { count: lotCount },
    { count: releasedLotCount },
    { count: productionCount },
    { count: activeProductionCount },
    { count: qualityCount },
    { count: pendingQualityCount },
    { data: costBatches },
  ] = await Promise.all([
    supabase
      .from("materials")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("materials")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("type", "finished")
      .is("deleted_at", null),
    supabase
      .from("material_lots")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("material_lots")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "released")
      .is("deleted_at", null),
    supabase
      .from("production_orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("production_orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("status", ["planned", "in_progress"])
      .is("deleted_at", null),
    supabase
      .from("quality_checks")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("quality_checks")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "draft")
      .is("deleted_at", null),
    supabase
      .from("production_batches")
      .select("cost_total, cost_currency, completed_at")
      .eq("company_id", companyId)
      .in("status", ["completed", "closed"])
      .not("cost_total", "is", null)
      .is("deleted_at", null)
      .returns<CostBatchRow[]>(),
  ]);

  const now = new Date();
  const monthStartIso = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  ).toISOString();
  const thirtyDaysAgoIso = new Date(
    now.getTime() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const sumIn = (rows: CostBatchRow[]): number =>
    rows.reduce((acc, r) => acc + Number(r.cost_total ?? 0), 0);

  const allBatches = costBatches ?? [];
  const batchesByCurrency = new Map<SupportedCurrency, CostBatchRow[]>(
    SUPPORTED_CURRENCIES.map((currency) => [currency, []]),
  );

  for (const batch of allBatches) {
    const currency = normalizeSupportedCurrency(batch.cost_currency);
    if (!currency) continue;
    batchesByCurrency.get(currency)?.push(batch);
  }

  const currencyRows = SUPPORTED_CURRENCIES.map((currency) => {
    const rows = batchesByCurrency.get(currency) ?? [];
    const thisMonthRows = rows.filter(
      (b) => b.completed_at && b.completed_at >= monthStartIso,
    );
    const last30Rows = rows.filter(
      (b) => b.completed_at && b.completed_at >= thirtyDaysAgoIso,
    );
    return {
      currency,
      count: rows.length,
      batchesLast30: last30Rows.length,
      sumThisMonth: sumIn(thisMonthRows),
      sumLast30: sumIn(last30Rows),
      sumAllTime: sumIn(rows),
    };
  });

  const otherCurrencies = Array.from(
    new Set(
      allBatches
        .map((b) => b.cost_currency)
        .filter(
          (c): c is string =>
            c !== null && c !== "" && normalizeSupportedCurrency(c) === null,
        ),
    ),
  );
  const currencyNote =
    otherCurrencies.length > 0
      ? `Desteklenmeyen para birimleri: ${otherCurrencies.join(", ")}`
      : undefined;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Raporlar</h1>
          <p className="text-sm text-muted-foreground">
            Firma operasyonlarının anlık ERP özeti.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={companyModulePath(companyId, "reports", "costs")}>
            <Button>Maliyet Detayı</Button>
          </Link>
          <Link href={companyModulePath(companyId)}>
            <Button variant="outline">Panele Dön</Button>
          </Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Malzeme" value={materialCount ?? 0} />
        <MetricCard label="Bitmiş Ürün" value={productCount ?? 0} />
        <MetricCard label="Lot" value={lotCount ?? 0} />
        <MetricCard label="Serbest Lot" value={releasedLotCount ?? 0} />
        <MetricCard label="Üretim Emri" value={productionCount ?? 0} />
        <MetricCard label="Aktif Üretim" value={activeProductionCount ?? 0} />
        <MetricCard label="QC Kaydı" value={qualityCount ?? 0} />
        <MetricCard label="Taslak QC" value={pendingQualityCount ?? 0} />
      </section>

      <section className="space-y-2">
        <div className="flex items-end justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Üretim Maliyeti
          </h2>
          {currencyNote ? (
            <p className="text-xs text-muted-foreground">{currencyNote}</p>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {currencyRows.map((row) => (
            <CostCard
              key={`${row.currency}-month`}
              label={`Bu Ay (${row.currency})`}
              amount={row.count > 0 ? row.sumThisMonth : null}
              currency={row.currency}
            />
          ))}
          {currencyRows.map((row) => (
            <CostCard
              key={`${row.currency}-last30`}
              label={`Son 30 Gün (${row.currency})`}
              amount={row.count > 0 ? row.sumLast30 : null}
              currency={row.currency}
              sublabel={`${row.batchesLast30} parti`}
            />
          ))}
          {currencyRows.map((row) => (
            <CostCard
              key={`${row.currency}-total`}
              label={`Toplam (${row.currency})`}
              amount={row.count > 0 ? row.sumAllTime : null}
              currency={row.currency}
              sublabel={`${row.count} maliyetli parti`}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
