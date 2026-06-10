import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
import { getCompanySummary } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

interface CompanyStats {
  totalProducts: number;
  totalMaterials: number;
  criticalStock: number;
  ongoingProduction: number;
  pendingQuality: number;
  openOrders: number;
}

async function loadCompanyStats(companyId: string): Promise<CompanyStats> {
  const supabase = await createServerSupabaseClient();

  const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [
    { count: totalMaterials },
    { count: totalProducts },
    { count: ongoingProduction },
    { count: criticalStock },
    { count: pendingQuality },
    { count: openOrders },
  ] = await Promise.all([
    supabase
      .from("materials")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("type", "raw")
      .is("deleted_at", null),
    supabase
      .from("materials")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("type", "finished")
      .is("deleted_at", null),
    supabase
      .from("production_orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("status", ["planned", "in_progress"])
      .is("deleted_at", null),
    supabase
      .from("material_lots")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gt("quantity_on_hand", 0)
      .or(`status.eq.blocked,expiry_date.lte.${thirtyDaysOut}`)
      .is("deleted_at", null),
    supabase
      .from("quality_checks")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "draft")
      .is("deleted_at", null),
    supabase
      .from("production_orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("status", ["draft", "planned", "in_progress"])
      .is("deleted_at", null),
  ]);

  return {
    totalProducts: totalProducts ?? 0,
    totalMaterials: totalMaterials ?? 0,
    criticalStock: criticalStock ?? 0,
    ongoingProduction: ongoingProduction ?? 0,
    pendingQuality: pendingQuality ?? 0,
    openOrders: openOrders ?? 0,
  };
}

type QuickAction =
  | { label: string; href: string; description: string }
  | { label: string; phase: string };

function buildQuickActions(companyId: string): QuickAction[] {
  return [
    {
      label: "Yeni Üretim Emri",
      href: companyModulePath(companyId, "production", "new"),
      description: "Yayındaki bir reçeteden üretim emri açın.",
    },
    {
      label: "Hammadde Girişi",
      href: companyModulePath(companyId, "lots", "new"),
      description: "Yeni mal kabul ile lot oluşturun.",
    },
    {
      label: "Ürün Ekle",
      href: companyModulePath(companyId, "products", "new"),
      description: "Yeni bitmiş ürün kartı tanımlayın.",
    },
    {
      label: "Reçete Oluştur",
      href: companyModulePath(companyId, "recipes", "new"),
      description: "Bitmiş ürün için yeni reçete oluşturun.",
    },
    {
      label: "Kalite Kayıt",
      href: companyModulePath(companyId, "quality", "new"),
      description: "Karantinadaki lot veya parti için QC açın.",
    },
    { label: "Sipariş Oluştur", phase: "5+" },
  ];
}

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function CompanyDashboardPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyUser(routeCompanyId);

  const [company, stats] = await Promise.all([
    getCompanySummary(companyId),
    loadCompanyStats(companyId),
  ]);
  const quickActions = buildQuickActions(companyId);

  const cards = [
    {
      label: "Toplam Ürün",
      value: stats.totalProducts,
      href: companyModulePath(companyId, "products"),
    },
    {
      label: "Toplam Hammadde",
      value: stats.totalMaterials,
      href: companyModulePath(companyId, "materials"),
    },
    {
      label: "Kritik Stok",
      value: stats.criticalStock,
      href: companyModulePath(companyId, "stock"),
    },
    {
      label: "Devam Eden Üretim",
      value: stats.ongoingProduction,
      href: companyModulePath(companyId, "production"),
    },
    {
      label: "Bekleyen Kalite Kontrol",
      value: stats.pendingQuality,
      href: companyModulePath(companyId, "quality"),
    },
    {
      label: "Açık Siparişler",
      value: stats.openOrders,
      href: companyModulePath(companyId, "orders"),
    },
  ];

  const hasAnyData =
    stats.totalProducts +
      stats.totalMaterials +
      stats.ongoingProduction +
      stats.pendingQuality >
    0;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {company?.name ?? "Firma"} · Panel
        </h1>
        <p className="text-sm text-muted-foreground">
          Operasyonel ERP modülleri. Tüm veri{" "}
          <code className="font-mono">company_id</code> ile izole edilir.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const body = (
            <>
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
                {c.value}
              </p>
            </>
          );
          return c.href ? (
            <Link
              key={c.label}
              href={c.href}
              className="rounded-md border border-border bg-card p-4 transition-colors hover:bg-secondary/40"
            >
              {body}
            </Link>
          ) : (
            <article
              key={c.label}
              className="rounded-md border border-border bg-card p-4"
            >
              {body}
            </article>
          );
        })}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Hızlı İşlemler</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((a) =>
            "href" in a ? (
              <Link
                key={a.label}
                href={a.href}
                className="rounded-md border border-border bg-card p-4 transition-colors hover:bg-secondary/40"
              >
                <p className="text-sm font-medium">{a.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {a.description}
                </p>
              </Link>
            ) : (
              <article
                key={a.label}
                className="rounded-md border border-border bg-card p-4 opacity-70"
              >
                <p className="text-sm font-medium">{a.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Faz {a.phase}&apos;te aktifleşecek.
                </p>
              </article>
            ),
          )}
        </div>
      </section>

      {hasAnyData ? null : (
        <EmptyState
          title="Henüz kayıt yok"
          description="Hızlı işlemlerden bir reçete, lot veya üretim emri oluşturarak başlayın."
        />
      )}
    </div>
  );
}
