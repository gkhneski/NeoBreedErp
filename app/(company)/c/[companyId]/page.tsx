import {
  ArrowUpRight,
  BookOpenText,
  Boxes,
  ClipboardList,
  Factory,
  FlaskConical,
  Package,
  PackageCheck,
  ScanLine,
  Send,
  ShieldCheck,
  Store,
  Truck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
import { getCompanySummary } from "@/lib/company";
import { getExpiryThresholds } from "@/lib/company-settings";
import {
  EXPIRY_BADGE_CLASS,
  EXPIRY_LABEL,
  daysUntil,
  expiryUrgency,
  isoDatePlusDays,
  todayIso,
  type ExpiryThresholds,
} from "@/lib/expiry";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

import { DepotHero } from "./depot-hero";

interface CompanyStats {
  totalProducts: number;
  totalMaterials: number;
  criticalStock: number;
  ongoingProduction: number;
  pendingQuality: number;
  openOrders: number;
  pendingPriceApprovals: number;
}

async function loadCompanyStats(
  companyId: string,
  criticalDays: number,
): Promise<CompanyStats> {
  const supabase = await createServerSupabaseClient();

  const criticalOut = isoDatePlusDays(criticalDays);

  const [
    { count: totalMaterials },
    { count: totalProducts },
    { count: ongoingProduction },
    { count: criticalStock },
    { count: pendingQuality },
    { count: openOrders },
    { count: pendingPriceApprovals },
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
      .or(`status.eq.blocked,expiry_date.lte.${criticalOut}`)
      .is("deleted_at", null),
    supabase
      .from("quality_checks")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "draft")
      .is("deleted_at", null),
    supabase
      .from("shipments")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("status", ["open", "preparing"])
      .is("deleted_at", null),
    supabase
      .from("marketplace_price_events")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "pending"),
  ]);

  return {
    totalProducts: totalProducts ?? 0,
    totalMaterials: totalMaterials ?? 0,
    criticalStock: criticalStock ?? 0,
    ongoingProduction: ongoingProduction ?? 0,
    pendingQuality: pendingQuality ?? 0,
    openOrders: openOrders ?? 0,
    pendingPriceApprovals: pendingPriceApprovals ?? 0,
  };
}

type QuickAction = {
  label: string;
  href: string;
  description: string;
  Icon: LucideIcon;
};

function buildQuickActions(companyId: string): QuickAction[] {
  return [
    {
      label: "Yeni Üretim Emri",
      href: companyModulePath(companyId, "production", "new"),
      description: "Yayındaki bir reçeteden üretim emri açın.",
      Icon: Factory,
    },
    {
      label: "Hammadde Girişi",
      href: companyModulePath(companyId, "lots", "new"),
      description: "Yeni mal kabul ile lot oluşturun.",
      Icon: FlaskConical,
    },
    {
      label: "Ürün Ekle",
      href: companyModulePath(companyId, "products", "new"),
      description: "Yeni bitmiş ürün kartı tanımlayın.",
      Icon: Package,
    },
    {
      label: "Reçete Oluştur",
      href: companyModulePath(companyId, "recipes", "new"),
      description: "Bitmiş ürün için yeni reçete oluşturun.",
      Icon: BookOpenText,
    },
    {
      label: "Kalite Kayıt",
      href: companyModulePath(companyId, "quality", "new"),
      description: "Karantinadaki lot veya parti için QC açın.",
      Icon: ShieldCheck,
    },
    {
      label: "Sipariş Oluştur",
      href: companyModulePath(companyId, "shipments", "new"),
      description: "Ecza deposu veya pazaryeri siparişi açın.",
      Icon: Send,
    },
  ];
}

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type ExpiringLotRow = {
  id: string;
  lot_number: string;
  expiry_date: string | null;
  quantity_on_hand: number;
  materials: { name: string; base_uom: string } | null;
  locations: { code: string; name: string } | null;
};

async function loadExpiryCounts(
  companyId: string,
  thresholds: ExpiryThresholds,
) {
  const supabase = await createServerSupabaseClient();
  const today = todayIso();
  const criticalOut = isoDatePlusDays(thresholds.criticalDays);
  const warningOut = isoDatePlusDays(thresholds.warningDays);

  // Depo paneli operatore ozel: yalnizca bitmis urun lotlari sayilir/listelenir.
  const stockedLots = () =>
    supabase
      .from("material_lots")
      .select("id, materials:material_id!inner(type)", {
        count: "exact",
        head: true,
      })
      .eq("company_id", companyId)
      .eq("materials.type", "finished")
      .gt("quantity_on_hand", 0)
      .is("deleted_at", null);

  const [
    { count: stocked },
    { count: expired },
    { count: critical },
    { count: warning },
    { data: soonest },
  ] = await Promise.all([
    stockedLots(),
    stockedLots().lt("expiry_date", today),
    stockedLots().gte("expiry_date", today).lte("expiry_date", criticalOut),
    stockedLots().gt("expiry_date", criticalOut).lte("expiry_date", warningOut),
    supabase
      .from("material_lots")
      .select(
        "id, lot_number, expiry_date, quantity_on_hand, " +
          "materials:material_id!inner(name, base_uom, type), " +
          "locations:location_id(code, name)",
      )
      .eq("company_id", companyId)
      .eq("materials.type", "finished")
      .gt("quantity_on_hand", 0)
      .not("expiry_date", "is", null)
      .is("deleted_at", null)
      .order("expiry_date", { ascending: true })
      .limit(5)
      .returns<ExpiringLotRow[]>(),
  ]);

  return {
    stocked: stocked ?? 0,
    expired: expired ?? 0,
    critical: critical ?? 0,
    warning: warning ?? 0,
    soonest: soonest ?? [],
  };
}

function ExpirySummary({
  companyId,
  thresholds,
  counts,
}: {
  companyId: string;
  thresholds: ExpiryThresholds;
  counts: Awaited<ReturnType<typeof loadExpiryCounts>>;
}) {
  // Depo personeli "lots" modulunu gormez; SKT kartlari bitmis urun stoguna gider.
  const finishedStockPath = `${companyModulePath(companyId, "stock")}?tab=urun`;
  const chips = [
    {
      key: "expired" as const,
      label: EXPIRY_LABEL.expired,
      value: counts.expired,
      ring: "ring-red-500/30",
      grad: "from-red-500 to-rose-600",
    },
    {
      key: "critical" as const,
      label: `${EXPIRY_LABEL.critical} ≤${thresholds.criticalDays}g`,
      value: counts.critical,
      ring: "ring-orange-500/30",
      grad: "from-orange-400 to-amber-500",
    },
    {
      key: "warning" as const,
      label: `${EXPIRY_LABEL.warning} ≤${thresholds.warningDays}g`,
      value: counts.warning,
      ring: "ring-amber-400/30",
      grad: "from-amber-300 to-yellow-400",
    },
  ];

  return (
    <section className="animate-fade-up space-y-3" style={{ animationDelay: "160ms" }}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Son Kullanma Takibi</h2>
        <Link
          href={finishedStockPath}
          className="text-xs font-medium text-primary hover:underline"
        >
          Tümü →
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {chips.map((c) => (
          <Link
            key={c.key}
            href={finishedStockPath}
            className={`flex items-center justify-between rounded-xl bg-card p-4 ring-1 ${c.ring} transition-transform hover:-translate-y-0.5`}
          >
            <div>
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
                {c.value}
              </p>
            </div>
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${c.grad} text-sm font-bold text-white tabular-nums shadow-md`}
            >
              {c.value}
            </span>
          </Link>
        ))}
      </div>

      {counts.soonest.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <p className="border-b border-border bg-secondary/50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            En Yakın SKT
          </p>
          <ul className="divide-y divide-border text-sm">
            {counts.soonest.slice(0, 4).map((lot) => {
              const urgency = expiryUrgency(lot.expiry_date, thresholds);
              const dte = daysUntil(lot.expiry_date);
              return (
                <li key={lot.id}>
                  <Link
                    href={finishedStockPath}
                    className="flex flex-wrap items-center gap-2 px-3 py-2 transition-colors hover:bg-secondary/40"
                  >
                    <span className="font-mono text-xs">{lot.lot_number}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {lot.materials?.name ?? "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {lot.locations?.code ?? "ANA"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {lot.expiry_date}
                    </span>
                    {urgency && urgency !== "ok" ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${EXPIRY_BADGE_CLASS[urgency]}`}
                      >
                        {urgency === "expired"
                          ? EXPIRY_LABEL.expired
                          : `${dte}g`}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

async function ClerkDashboard({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const supabase = await createServerSupabaseClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const thresholds = await getExpiryThresholds(companyId);

  const [
    { count: toPrepare },
    { count: shippedToday },
    { count: releasedLots },
    { count: pendingPriceApprovals },
    expiryCounts,
  ] = await Promise.all([
    supabase
      .from("shipments")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("status", ["open", "preparing"])
      .is("deleted_at", null),
    supabase
      .from("shipments")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "shipped")
      .gte("shipped_at", todayStart.toISOString()),
    supabase
      .from("material_lots")
      .select("id, materials:material_id!inner(type)", {
        count: "exact",
        head: true,
      })
      .eq("company_id", companyId)
      .eq("materials.type", "finished")
      .eq("status", "released")
      .gt("quantity_on_hand", 0)
      .is("deleted_at", null),
    supabase
      .from("marketplace_price_events")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "pending"),
    loadExpiryCounts(companyId, thresholds),
  ]);

  const cards: Array<{
    label: string;
    value: number;
    href: string;
    grad: string;
    glow: string;
    Icon: LucideIcon;
  }> = [
    {
      label: "Hazırlanacak Sipariş",
      value: toPrepare ?? 0,
      href: companyModulePath(companyId, "shipments") + "?durum=preparing",
      grad: "from-amber-400 to-orange-500",
      glow: "rgba(249,115,22,0.45)",
      Icon: ClipboardList,
    },
    {
      label: "Bugün Gönderilen",
      value: shippedToday ?? 0,
      href: companyModulePath(companyId, "shipments") + "?durum=shipped",
      grad: "from-emerald-400 to-teal-500",
      glow: "rgba(16,185,129,0.45)",
      Icon: Truck,
    },
    {
      label: "Sevk Edilebilir Lot",
      value: releasedLots ?? 0,
      href: `${companyModulePath(companyId, "stock")}?tab=urun`,
      grad: "from-cyan-400 to-sky-500",
      glow: "rgba(14,165,233,0.45)",
      Icon: PackageCheck,
    },
    {
      label: "Bekleyen Fiyat Onayı",
      value: pendingPriceApprovals ?? 0,
      href: companyModulePath(companyId, "marketplace"),
      grad: "from-violet-500 to-fuchsia-500",
      glow: "rgba(217,70,239,0.45)",
      Icon: Store,
    },
  ];

  const actions: Array<{
    label: string;
    href: string;
    description: string;
    Icon: LucideIcon;
  }> = [
    {
      label: "Barkod Tara",
      href: companyModulePath(companyId, "warehouse", "scan"),
      description: "Gelen koliyi okutup depoya alın.",
      Icon: ScanLine,
    },
    {
      label: "Yeni Sipariş",
      href: companyModulePath(companyId, "shipments", "new"),
      description: "Ecza deposu veya pazaryeri siparişi açın.",
      Icon: Send,
    },
    {
      label: "Siparişler",
      href: companyModulePath(companyId, "shipments"),
      description: "Hazırlanacak ve gönderilen siparişler.",
      Icon: ClipboardList,
    },
    {
      label: "Bitmiş Ürün Stoğu",
      href: `${companyModulePath(companyId, "stock")}?tab=urun`,
      description: "Eldeki bitmiş ürünleri lot ve SKT ile görün.",
      Icon: Boxes,
    },
  ];

  return (
    <div className="space-y-6">
      <DepotHero companyName={companyName} />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => {
          const Icon = c.Icon;
          return (
            <Link
              key={c.label}
              href={c.href}
              className={`animate-fade-up group relative overflow-hidden rounded-2xl bg-gradient-to-br ${c.grad} p-4 text-white shadow-lg transition-transform duration-200 hover:-translate-y-1`}
              style={{
                animationDelay: `${i * 70}ms`,
                boxShadow: `0 10px 30px -12px ${c.glow}`,
              }}
            >
              <div className="flex items-start justify-between">
                <p className="text-xs font-medium text-white/85">{c.label}</p>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-3 text-4xl font-semibold tabular-nums tracking-tight">
                {c.value}
              </p>
            </Link>
          );
        })}
      </section>

      <ExpirySummary
        companyId={companyId}
        thresholds={thresholds}
        counts={expiryCounts}
      />

      <section
        className="animate-fade-up space-y-3"
        style={{ animationDelay: "240ms" }}
      >
        <h2 className="text-sm font-semibold">Hızlı İşlemler</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {actions.map((a) => {
            const Icon = a.Icon;
            return (
              <Link
                key={a.label}
                href={a.href}
                className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <p className="text-sm font-medium">{a.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {a.description}
                  </p>
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default async function CompanyDashboardPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireCompanyUser(routeCompanyId);

  if (role === "operator") {
    const company = await getCompanySummary(companyId);
    return (
      <ClerkDashboard
        companyId={companyId}
        companyName={company?.name ?? "Firma"}
      />
    );
  }

  const thresholds = await getExpiryThresholds(companyId);
  const [company, stats, expiry] = await Promise.all([
    getCompanySummary(companyId),
    loadCompanyStats(companyId, thresholds.criticalDays),
    loadExpiryCounts(companyId, thresholds),
  ]);
  const quickActions = buildQuickActions(companyId);
  const finishedStockPath = `${companyModulePath(companyId, "stock")}?tab=urun`;

  const healthy = Math.max(
    0,
    expiry.stocked - expiry.expired - expiry.critical - expiry.warning,
  );
  const healthyPct =
    expiry.stocked > 0 ? Math.round((healthy / expiry.stocked) * 100) : null;

  const kpis = [
    {
      label: "Toplam Ürün",
      value: stats.totalProducts,
      sub: `${stats.totalMaterials} hammadde tanımlı`,
      href: companyModulePath(companyId, "products"),
      Icon: Package,
      hero: true,
    },
    {
      label: "Devam Eden Üretim",
      value: stats.ongoingProduction,
      sub: `${stats.pendingQuality} kalite bekliyor`,
      href: companyModulePath(companyId, "production"),
      Icon: Factory,
      hero: false,
    },
    {
      label: "Açık Siparişler",
      value: stats.openOrders,
      sub: "hazırlanacak / açık",
      href: companyModulePath(companyId, "shipments"),
      Icon: Send,
      hero: false,
    },
    {
      label: "Bekleyen Fiyat Onayı",
      value: stats.pendingPriceApprovals,
      sub: "pazaryeri indirimleri",
      href: companyModulePath(companyId, "marketplace"),
      Icon: Store,
      hero: false,
    },
  ];

  const sktBars = [
    { label: "Geçmiş", value: expiry.expired, cls: "bg-red-500" },
    { label: "Kritik", value: expiry.critical, cls: "bg-orange-500" },
    { label: "Uyarı", value: expiry.warning, cls: "bg-amber-400" },
    { label: "Sağlam", value: healthy, cls: "bg-emerald-500" },
  ];
  const sktMax = Math.max(1, ...sktBars.map((b) => b.value));

  const hasAnyData =
    stats.totalProducts +
      stats.totalMaterials +
      stats.ongoingProduction +
      stats.pendingQuality >
    0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {company?.name ?? "Firma"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Panel — üretim, stok ve pazaryeri için genel bakış.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={companyModulePath(companyId, "production", "new")}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            <Factory className="h-4 w-4" aria-hidden="true" />
            Yeni Üretim Emri
          </Link>
          <Link
            href={companyModulePath(companyId, "lots", "new")}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary/40"
          >
            <FlaskConical className="h-4 w-4" aria-hidden="true" />
            Hammadde Girişi
          </Link>
        </div>
      </header>

      {/* KPI satiri — ilki dolu yesil hero */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.Icon;
          if (k.hero) {
            return (
              <Link
                key={k.label}
                href={k.href}
                className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-5 text-white shadow-md transition-transform hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-white/70 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
                <p className="mt-4 text-4xl font-semibold tabular-nums tracking-tight">
                  {k.value}
                </p>
                <p className="mt-1 text-sm font-medium text-white/90">
                  {k.label}
                </p>
                <p className="mt-0.5 text-xs text-white/70">{k.sub}</p>
              </Link>
            );
          }
          return (
            <Link
              key={k.label}
              href={k.href}
              className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-emerald-600" />
              </div>
              <p className="mt-4 text-3xl font-semibold tabular-nums tracking-tight">
                {k.value}
              </p>
              <p className="mt-1 text-sm font-medium">{k.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{k.sub}</p>
            </Link>
          );
        })}
      </section>

      {/* SKT bar grafigi + Yaklasan SKT */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Son Kullanma Durumu</h2>
              <p className="text-xs text-muted-foreground">
                Eldeki bitmiş ürün lotları ({expiry.stocked})
              </p>
            </div>
            <Link
              href={finishedStockPath}
              className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Stoğa git →
            </Link>
          </div>
          <div className="mt-6 flex h-44 items-end gap-4">
            {sktBars.map((b) => (
              <div key={b.label} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-sm font-semibold tabular-nums">
                  {b.value}
                </span>
                <div className="flex h-full w-full items-end">
                  <div
                    className={`w-full rounded-t-lg ${b.cls} transition-all`}
                    style={{ height: `${Math.max(4, (b.value / sktMax) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{b.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Yaklaşan SKT</h2>
          {expiry.soonest.length > 0 ? (
            <ul className="mt-3 space-y-2.5">
              {expiry.soonest.slice(0, 5).map((lot) => {
                const urgency = expiryUrgency(lot.expiry_date, thresholds);
                const dte = daysUntil(lot.expiry_date);
                return (
                  <li key={lot.id}>
                    <Link
                      href={finishedStockPath}
                      className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-secondary/50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {lot.materials?.name ?? "—"}
                        </span>
                        <span className="block truncate font-mono text-xs text-muted-foreground">
                          {lot.lot_number} · {lot.expiry_date}
                        </span>
                      </span>
                      {urgency && urgency !== "ok" ? (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${EXPIRY_BADGE_CLASS[urgency]}`}
                        >
                          {urgency === "expired" ? EXPIRY_LABEL.expired : `${dte}g`}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Yaklaşan SKT yok.
            </p>
          )}
        </section>
      </div>

      {/* Hizli islemler + Stok sagligi gostergesi */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold">Hızlı İşlemler</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {quickActions.map((a) => {
              const Icon = a.Icon;
              return (
                <Link
                  key={a.label}
                  href={a.href}
                  className="group flex items-start gap-3 rounded-xl border border-border p-3 transition-all hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-sm"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white dark:text-emerald-400">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span>
                    <p className="text-sm font-medium">{a.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {a.description}
                    </p>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col items-center rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex w-full items-center justify-between">
            <h2 className="text-sm font-semibold">Stok Sağlığı</h2>
            <Link
              href={finishedStockPath}
              className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Detay →
            </Link>
          </div>
          {healthyPct !== null ? (
            <>
              <div
                className="relative mt-5 h-40 w-40 rounded-full"
                style={{
                  background: `conic-gradient(#059669 ${healthyPct}%, rgba(148,163,184,0.25) ${healthyPct}% 100%)`,
                }}
              >
                <div className="absolute inset-[14px] flex flex-col items-center justify-center rounded-full bg-card">
                  <span className="text-3xl font-semibold tabular-nums">
                    %{healthyPct}
                  </span>
                  <span className="text-xs text-muted-foreground">SKT güvende</span>
                </div>
              </div>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                {healthy} / {expiry.stocked} lotun son kullanma tarihi güvenli
                aralıkta.
              </p>
            </>
          ) : (
            <p className="mt-10 text-center text-sm text-muted-foreground">
              Henüz stoklu bitmiş ürün lotu yok.
            </p>
          )}
        </section>
      </div>

      {hasAnyData ? null : (
        <EmptyState
          title="Henüz kayıt yok"
          description="Hızlı işlemlerden bir reçete, lot veya üretim emri oluşturarak başlayın."
        />
      )}
    </div>
  );
}
