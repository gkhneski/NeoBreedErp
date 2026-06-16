import { Factory, FlaskConical, ScanLine, Send } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
import { getCompanySummary } from "@/lib/company";
import { getExpiryThresholds } from "@/lib/company-settings";
import {
  daysUntil,
  isoDatePlusDays,
  todayIso,
  type ExpiryThresholds,
} from "@/lib/expiry";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uomLabel } from "@/lib/uom";
import {
  COMPANY_ROLE_LABELS,
  companyModulePath,
  type CompanyRole,
} from "@/types/roles";

import {
  DashboardVisuals,
  StatusStrip,
  type GaugeData,
  type KpiData,
  type Member,
  type ReminderData,
  type StatusStripData,
  type TaskItem,
  type Tone,
  type WeeklyBar,
} from "./dashboard-visuals";
import { OperatorOrderNotifier } from "./order-notifier";

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
    .select("occurred_at, material_lots:lot_id!inner(deleted_at)")
    .eq("company_id", companyId)
    .is("material_lots.deleted_at", null)
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

// LTD deposu (varsayilan olmayan aktif depo) icindeki bitmis urunun toplam
// adedi ve kac cesit oldugu. Ana Depo (fabrika, is_default) haric.
async function loadLtdDepotTotals(
  companyId: string,
): Promise<{ units: number; products: number }> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("material_lots")
    .select(
      "quantity_on_hand, material_id, " +
        "materials:material_id!inner(type), " +
        "locations:location_id!inner(is_default)",
    )
    .eq("company_id", companyId)
    .eq("materials.type", "finished")
    .eq("locations.is_default", false)
    .is("deleted_at", null)
    .gt("quantity_on_hand", 0)
    .returns<Array<{ quantity_on_hand: number; material_id: string }>>();

  let units = 0;
  const products = new Set<string>();
  for (const row of data ?? []) {
    units += Number(row.quantity_on_hand);
    products.add(row.material_id);
  }
  return { units, products: products.size };
}

type ExpiringLotRow = {
  id: string;
  lot_number: string;
  expiry_date: string | null;
  quantity_on_hand: number;
  material_id: string;
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
        "id, lot_number, expiry_date, quantity_on_hand, material_id, " +
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
    ltd,
    expiry,
    weekly,
    team,
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
    loadLtdDepotTotals(companyId),
    loadExpiryCounts(companyId, thresholds),
    loadWeeklyMovements(companyId),
    loadTeam(companyId),
  ]);

  const finishedStockPath = `${companyModulePath(companyId, "stock")}?tab=urun`;
  const shipmentsPath = companyModulePath(companyId, "shipments");
  const marketplacePath = companyModulePath(companyId, "marketplace");

  const healthy = Math.max(
    0,
    expiry.stocked - expiry.expired - expiry.critical - expiry.warning,
  );
  const healthyPct =
    expiry.stocked > 0 ? Math.round((healthy / expiry.stocked) * 100) : null;
  const weeklyTotal = weekly.reduce((sum, b) => sum + b.value, 0);

  const kpis: KpiData[] = [
    {
      label: "Sevk Edilebilir Lot",
      value: releasedLots ?? 0,
      sub: "bitmiş ürün, serbest",
      href: finishedStockPath,
      icon: "boxes",
      hero: true,
    },
    {
      label: "Hazırlanacak Sipariş",
      value: toPrepare ?? 0,
      sub: "hazırlanacak / açık",
      href: `${shipmentsPath}?durum=preparing`,
      icon: "clipboard",
    },
    {
      label: "Bugün Gönderilen",
      value: shippedToday ?? 0,
      sub: "bugün sevk edilen",
      href: `${shipmentsPath}?durum=shipped`,
      icon: "send",
    },
    {
      label: "LTD Deposu — Toplam Ürün",
      value: ltd.units,
      sub: `${ltd.products.toLocaleString("tr-TR")} çeşit ürün`,
      href: finishedStockPath,
      icon: "boxes",
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

  const urgentExpiry = expiry.critical + expiry.expired;
  const urgentLot = urgentExpiry > 0 ? expiry.soonest[0] : null;
  const urgentLabel = urgentLot
    ? `${urgentLot.materials?.name ?? "Ürün"} · ${Number(
        urgentLot.quantity_on_hand,
      ).toLocaleString("tr-TR")} ${uomLabel(urgentLot.materials?.base_uom)}`
    : null;

  const statusStrip: StatusStripData = {
    readyToShip: releasedLots ?? 0,
    toPrepare: toPrepare ?? 0,
    urgentExpiry,
    shippedToday: shippedToday ?? 0,
    urgentLabel,
    readyHref: finishedStockPath,
    prepareHref: `${shipmentsPath}?durum=preparing`,
    urgentHref: urgentLot
      ? `${companyModulePath(companyId, "sales")}?urun=${urgentLot.material_id}`
      : finishedStockPath,
    shippedHref: `${shipmentsPath}?durum=shipped`,
  };

  const tasks: TaskItem[] = [
    {
      label: "Hazırlanacak Sipariş",
      sub: "Sevk bekliyor",
      count: toPrepare ?? 0,
      href: `${shipmentsPath}?durum=preparing`,
      icon: "clipboard",
      tone: "blue",
    },
    {
      label: "Bekleyen Fiyat Onayı",
      sub: "Pazaryeri indirimleri",
      count: pendingPriceApprovals ?? 0,
      href: marketplacePath,
      icon: "store",
      tone: "amber",
    },
    {
      label: "Kritik / Geçmiş SKT",
      sub: "Acil eritilecek stok",
      count: expiry.critical + expiry.expired,
      href: finishedStockPath,
      icon: "alert",
      tone: "rose",
    },
    {
      label: "Yaklaşan SKT",
      sub: `≤${thresholds.warningDays} gün`,
      count: expiry.warning,
      href: finishedStockPath,
      icon: "shield",
      tone: "violet",
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{companyName}</h1>
          <p className="text-sm text-muted-foreground">
            Depo Paneli — sevkiyat ve bitmiş ürün stoğu.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={companyModulePath(companyId, "lots", "onboarding")}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            <ScanLine className="h-4 w-4" aria-hidden="true" />
            Stok Girişi
          </Link>
          <Link
            href={companyModulePath(companyId, "shipments", "new")}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary/40"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            Yeni Sipariş
          </Link>
        </div>
      </header>

      <StatusStrip data={statusStrip} />

      <OperatorOrderNotifier companyId={companyId} />

      <DashboardVisuals
        kpis={kpis}
        weekly={weekly}
        weeklyTotalLabel={`Bu hafta ${weeklyTotal} stok hareketi`}
        gauge={gauge}
        reminder={reminder}
        tasks={tasks}
        team={team}
        stockHref={finishedStockPath}
        canManageTeam={false}
      />
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
  const [company, stats, ltd, expiry, weekly, team] = await Promise.all([
    getCompanySummary(companyId),
    loadCompanyStats(companyId, thresholds.criticalDays),
    loadLtdDepotTotals(companyId),
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
      label: "LTD Deposu — Toplam Ürün",
      value: ltd.units,
      sub: `${ltd.products.toLocaleString("tr-TR")} çeşit ürün`,
      href: finishedStockPath,
      icon: "boxes",
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
      sub: "Karantinadaki lotlar",
      count: stats.pendingQuality,
      href: companyModulePath(companyId, "quality"),
      icon: "shield",
      tone: "violet",
    },
    {
      label: "Açık Siparişler",
      sub: "Hazırlanacak / açık",
      count: stats.openOrders,
      href: companyModulePath(companyId, "shipments"),
      icon: "clipboard",
      tone: "blue",
    },
    {
      label: "Bekleyen Fiyat Onayı",
      sub: "Pazaryeri indirimleri",
      count: stats.pendingPriceApprovals,
      href: companyModulePath(companyId, "marketplace"),
      icon: "store",
      tone: "amber",
    },
    {
      label: "Kritik / Geçmiş SKT",
      sub: "Acil eritilecek stok",
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
