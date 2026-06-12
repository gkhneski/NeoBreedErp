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

interface CompanyStats {
  totalProducts: number;
  totalMaterials: number;
  criticalStock: number;
  ongoingProduction: number;
  pendingQuality: number;
  openOrders: number;
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
    {
      label: "Sipariş Oluştur",
      href: companyModulePath(companyId, "shipments", "new"),
      description: "Ecza deposu veya pazaryeri siparişi açın.",
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

  const stockedLots = () =>
    supabase
      .from("material_lots")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gt("quantity_on_hand", 0)
      .is("deleted_at", null);

  const [
    { count: expired },
    { count: critical },
    { count: warning },
    { data: soonest },
  ] = await Promise.all([
    stockedLots().lt("expiry_date", today),
    stockedLots().gte("expiry_date", today).lte("expiry_date", criticalOut),
    stockedLots().gt("expiry_date", criticalOut).lte("expiry_date", warningOut),
    supabase
      .from("material_lots")
      .select(
        "id, lot_number, expiry_date, quantity_on_hand, " +
          "materials:material_id(name, base_uom), " +
          "locations:location_id(code, name)",
      )
      .eq("company_id", companyId)
      .gt("quantity_on_hand", 0)
      .not("expiry_date", "is", null)
      .is("deleted_at", null)
      .order("expiry_date", { ascending: true })
      .limit(5)
      .returns<ExpiringLotRow[]>(),
  ]);

  return {
    expired: expired ?? 0,
    critical: critical ?? 0,
    warning: warning ?? 0,
    soonest: soonest ?? [],
  };
}

function ExpiryTrackingSection({
  companyId,
  thresholds,
  counts,
}: {
  companyId: string;
  thresholds: ExpiryThresholds;
  counts: Awaited<ReturnType<typeof loadExpiryCounts>>;
}) {
  const lotsPath = companyModulePath(companyId, "lots");
  const cards = [
    {
      key: "expired" as const,
      label: EXPIRY_LABEL.expired,
      value: counts.expired,
      href: `${lotsPath}?skt=expired`,
    },
    {
      key: "critical" as const,
      label: `${EXPIRY_LABEL.critical} (≤${thresholds.criticalDays} gün)`,
      value: counts.critical,
      href: `${lotsPath}?skt=critical`,
    },
    {
      key: "warning" as const,
      label: `${EXPIRY_LABEL.warning} (≤${thresholds.warningDays} gün)`,
      value: counts.warning,
      href: `${lotsPath}?skt=warning`,
    },
  ];

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Son Kullanma Takibi</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.key}
            href={c.href}
            className="rounded-md border border-border bg-card p-4 transition-colors hover:bg-secondary/40"
          >
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  c.value > 0 ? EXPIRY_BADGE_CLASS[c.key] : "bg-emerald-500"
                }`}
              />
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
              {c.value}
            </p>
          </Link>
        ))}
      </div>

      {counts.soonest.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border">
          <p className="border-b border-border bg-secondary/50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            En Yakın SKT
          </p>
          <ul className="divide-y divide-border text-sm">
            {counts.soonest.map((lot) => {
              const urgency = expiryUrgency(lot.expiry_date, thresholds);
              const dte = daysUntil(lot.expiry_date);
              return (
                <li key={lot.id}>
                  <Link
                    href={`${lotsPath}/${lot.id}`}
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
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "released")
      .gt("quantity_on_hand", 0)
      .is("deleted_at", null),
    loadExpiryCounts(companyId, thresholds),
  ]);

  const cards = [
    {
      label: "Hazırlanacak Sipariş",
      value: toPrepare ?? 0,
      href: companyModulePath(companyId, "shipments") + "?durum=preparing",
    },
    {
      label: "Bugün Gönderilen",
      value: shippedToday ?? 0,
      href: companyModulePath(companyId, "shipments") + "?durum=shipped",
    },
    {
      label: "Sevk Edilebilir Lot",
      value: releasedLots ?? 0,
      href: companyModulePath(companyId, "lots"),
    },
  ];

  const actions = [
    {
      label: "Barkod Tara",
      href: companyModulePath(companyId, "warehouse", "scan"),
      description: "Gelen koliyi okutup depoya alın.",
    },
    {
      label: "Yeni Sipariş",
      href: companyModulePath(companyId, "shipments", "new"),
      description: "Ecza deposu veya pazaryeri siparişi açın.",
    },
    {
      label: "Siparişler",
      href: companyModulePath(companyId, "shipments"),
      description: "Hazırlanacak ve gönderilen siparişler.",
    },
    {
      label: "Mal Kabul",
      href: companyModulePath(companyId, "lots", "new"),
      description: "Yeni lot girişi yapın.",
    },
    {
      label: "Mevcut Stok Girişi",
      href: companyModulePath(companyId, "lots", "onboarding"),
      description: "Depodaki eski ürünleri SKT ve adetle kaydedin.",
    },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {companyName} · Depo Paneli
        </h1>
        <p className="text-sm text-muted-foreground">
          Gelen kolileri okutun, siparişleri hazırlayıp gönderin.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-md border border-border bg-card p-4 transition-colors hover:bg-secondary/40"
          >
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
              {c.value}
            </p>
          </Link>
        ))}
      </section>

      <ExpiryTrackingSection
        companyId={companyId}
        thresholds={thresholds}
        counts={expiryCounts}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Hızlı İşlemler</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {actions.map((a) => (
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
          ))}
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
  const [company, stats] = await Promise.all([
    getCompanySummary(companyId),
    loadCompanyStats(companyId, thresholds.criticalDays),
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
      label: `Kritik Stok (SKT ≤${thresholds.criticalDays} gün / bloklu)`,
      value: stats.criticalStock,
      href: `${companyModulePath(companyId, "lots")}?skt=critical`,
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
      href: companyModulePath(companyId, "shipments"),
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
