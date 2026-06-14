import {
  Boxes,
  ClipboardList,
  Factory,
  FlaskConical,
  PackageCheck,
  ScanLine,
  Send,
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
import {
  COMPANY_ROLE_LABELS,
  companyModulePath,
  type CompanyRole,
} from "@/types/roles";

import {
  DashboardVisuals,
  type GaugeData,
  type KpiData,
  type Member,
  type ReminderData,
  type TaskItem,
  type Tone,
  type WeeklyBar,
} from "./dashboard-visuals";
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

const MEMBER_TONES: Tone[] = [
  "emerald",
  "blue",
  "violet",
  "amber",
  "rose",
  "cyan",
];

async function loadTeam(companyId: string): Promise<Member[]> {
  const supabase = await createServerSupabaseClient();
  const { data: members } = await supabase
    .from("company_users")
    .select("user_id, role, created_at")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(6)
    .returns<Array<{ user_id: string; role: CompanyRole }>>();

  const ids = (members ?? []).map((m) => m.user_id);
  type Prof = { id: string; full_name: string | null; email: string | null };
  const { data: profiles } = ids.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids)
        .returns<Prof[]>()
    : { data: [] as Prof[] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  return (members ?? []).map((m, i) => {
    const p = byId.get(m.user_id);
    const name = p?.full_name || p?.email?.split("@")[0] || "Üye";
    const initials =
      name
        .split(/\s+/)
        .map((w) => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase() || "?";
    return {
      name,
      role: COMPANY_ROLE_LABELS[m.role] ?? m.role,
      initials,
      tone: MEMBER_TONES[i % MEMBER_TONES.length],
    };
  });
}

async function loadWeeklyMovements(companyId: string): Promise<WeeklyBar[]> {
  const supabase = await createServerSupabaseClient();
  const since = new Date();
  since.setDate(since.getDate() - 6);
  since.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("stock_movements")
    .select("occurred_at")
    .eq("company_id", companyId)
    .gte("occurred_at", since.toISOString())
    .limit(5000);

  const labels = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
  const buckets = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of data ?? []) {
    const key = String(row.occurred_at).slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return Array.from(buckets.entries()).map(([key, value]) => ({
    label: labels[new Date(`${key}T00:00:00`).getDay()],
    value,
  }));
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
  const [company, stats, expiry, weekly, team] = await Promise.all([
    getCompanySummary(companyId),
    loadCompanyStats(companyId, thresholds.criticalDays),
    loadExpiryCounts(companyId, thresholds),
    loadWeeklyMovements(companyId),
    loadTeam(companyId),
  ]);
  const finishedStockPath = `${companyModulePath(companyId, "stock")}?tab=urun`;

  const healthy = Math.max(
    0,
    expiry.stocked - expiry.expired - expiry.critical - expiry.warning,
  );
  const healthyPct =
    expiry.stocked > 0 ? Math.round((healthy / expiry.stocked) * 100) : null;
  const weeklyTotal = weekly.reduce((sum, b) => sum + b.value, 0);

  const kpis: KpiData[] = [
    {
      label: "Toplam Ürün",
      value: stats.totalProducts,
      sub: `${stats.totalMaterials} hammadde tanımlı`,
      href: companyModulePath(companyId, "products"),
      icon: "package",
      hero: true,
    },
    {
      label: "Devam Eden Üretim",
      value: stats.ongoingProduction,
      sub: `${stats.pendingQuality} kalite bekliyor`,
      href: companyModulePath(companyId, "production"),
      icon: "factory",
    },
    {
      label: "Açık Siparişler",
      value: stats.openOrders,
      sub: "hazırlanacak / açık",
      href: companyModulePath(companyId, "shipments"),
      icon: "send",
    },
    {
      label: "Bekleyen Fiyat Onayı",
      value: stats.pendingPriceApprovals,
      sub: "pazaryeri indirimleri",
      href: companyModulePath(companyId, "marketplace"),
      icon: "store",
    },
  ];

  const gauge: GaugeData = {
    pct: healthyPct,
    healthy,
    critical: expiry.critical,
    expired: expiry.expired,
    stocked: expiry.stocked,
  };

  const nearest = expiry.soonest[0];
  const reminder: ReminderData = nearest
    ? {
        title: nearest.materials?.name ?? "Yaklaşan SKT",
        subtitle: `${nearest.lot_number} · SKT ${nearest.expiry_date ?? "—"}${
          nearest.expiry_date
            ? ` · ${daysUntil(nearest.expiry_date)} gün kaldı`
            : ""
        }`,
        href: finishedStockPath,
      }
    : null;

  const tasks: TaskItem[] = [
    {
      label: "Bekleyen Kalite Kontrol",
      count: stats.pendingQuality,
      href: companyModulePath(companyId, "quality"),
      icon: "shield",
      tone: "violet",
    },
    {
      label: "Açık Siparişler",
      count: stats.openOrders,
      href: companyModulePath(companyId, "shipments"),
      icon: "clipboard",
      tone: "blue",
    },
    {
      label: "Bekleyen Fiyat Onayı",
      count: stats.pendingPriceApprovals,
      href: companyModulePath(companyId, "marketplace"),
      icon: "store",
      tone: "amber",
    },
    {
      label: "Kritik / Geçmiş SKT",
      count: expiry.critical + expiry.expired,
      href: finishedStockPath,
      icon: "alert",
      tone: "rose",
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

      <DashboardVisuals
        kpis={kpis}
        weekly={weekly}
        weeklyTotalLabel={`Bu hafta ${weeklyTotal} stok hareketi`}
        gauge={gauge}
        reminder={reminder}
        tasks={tasks}
        team={team}
        stockHref={finishedStockPath}
        membersHref={companyModulePath(companyId, "users")}
      />

      {hasAnyData ? null : (
        <EmptyState
          title="Henüz kayıt yok"
          description="Hızlı işlemlerden bir reçete, lot veya üretim emri oluşturarak başlayın."
        />
      )}
    </div>
  );
}
