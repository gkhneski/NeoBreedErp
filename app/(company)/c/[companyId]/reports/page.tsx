import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-md border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
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
  ]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Raporlar</h1>
          <p className="text-sm text-muted-foreground">
            Firma operasyonlarının anlık ERP özeti.
          </p>
        </div>
        <Link href={companyModulePath(companyId)}>
          <Button variant="outline">Panele Dön</Button>
        </Link>
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
    </div>
  );
}
