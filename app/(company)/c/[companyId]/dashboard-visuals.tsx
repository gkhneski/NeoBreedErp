"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  ClipboardList,
  Factory,
  FlaskConical,
  Package,
  PackagePlus,
  Plus,
  Send,
  ShieldCheck,
  Store,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const ICONS: Record<string, LucideIcon> = {
  package: Package,
  factory: Factory,
  send: Send,
  store: Store,
  flask: FlaskConical,
  shield: ShieldCheck,
  clipboard: ClipboardList,
  alert: AlertTriangle,
  boxes: Boxes,
  plus: PackagePlus,
};

const TONES: Record<string, string> = {
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-500",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  cyan: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
};

export type Tone = keyof typeof TONES;

export type KpiData = {
  label: string;
  value: number;
  sub: string;
  href: string;
  icon: keyof typeof ICONS;
  hero?: boolean;
};
export type WeeklyBar = { label: string; value: number };
export type TaskItem = {
  label: string;
  sub: string;
  count: number;
  href: string;
  icon: keyof typeof ICONS;
  tone: Tone;
};
export type Member = { name: string; role: string; initials: string; tone: Tone };
export type ReminderData = { title: string; subtitle: string; href: string } | null;
export type GaugeData = {
  pct: number | null;
  healthy: number;
  critical: number;
  expired: number;
  stocked: number;
};

function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setM(true), 60);
    return () => clearTimeout(t);
  }, []);
  return m;
}

function useCountUp(target: number, mounted: boolean, duration = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!mounted) return;
    let raf = 0;
    let t0 = 0;
    const tick = (t: number) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / duration);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, mounted, duration]);
  return v;
}

/* ---------- Cards ---------- */

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-3xl border border-border bg-card p-4 shadow-[0_2px_12px_-6px_rgba(0,0,0,0.12)] sm:p-5 ${className}`}
    >
      {children}
    </section>
  );
}

function KpiCard({ kpi, index }: { kpi: KpiData; index: number }) {
  const mounted = useMounted();
  const display = useCountUp(kpi.value, mounted);
  const Icon = ICONS[kpi.icon] ?? Package;
  const base = `group relative overflow-hidden rounded-3xl p-4 transition-all duration-500 ease-out hover:-translate-y-1 sm:p-5 ${
    mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
  }`;

  if (kpi.hero) {
    return (
      <Link
        href={kpi.href}
        style={{ transitionDelay: `${index * 70}ms` }}
        className={`${base} bg-gradient-to-br from-green-800 via-green-600 to-emerald-500 text-white shadow-[0_18px_40px_-18px_rgba(5,150,105,0.75)]`}
      >
        <div
          className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full opacity-30"
          style={{
            background:
              "radial-gradient(circle, rgba(255,255,255,0.6) 0%, transparent 70%)",
          }}
        />
        <div className="relative flex items-center justify-between">
          <p className="text-sm font-medium text-white/90">{kpi.label}</p>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
        <p className="relative mt-3 text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">
          {display}
        </p>
        <span className="relative mt-3 inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1 text-xs font-medium text-white/90">
          <TrendingUp className="h-3.5 w-3.5" />
          {kpi.sub}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={kpi.href}
      style={{ transitionDelay: `${index * 70}ms` }}
      className={`${base} border border-border bg-card hover:border-emerald-500/50 hover:shadow-[0_14px_30px_-18px_rgba(5,150,105,0.55)]`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{kpi.label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors group-hover:border-emerald-500/50 group-hover:text-emerald-600">
          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
      </div>
      <p className="mt-3 flex items-center gap-2 text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        {display}
      </p>
      <span className="mt-3 inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <TrendingUp className="h-3.5 w-3.5" />
        {kpi.sub}
      </span>
    </Link>
  );
}

/* ---------- Pill bar chart ---------- */

function PillChart({ bars, totalLabel }: { bars: WeeklyBar[]; totalLabel: string }) {
  const mounted = useMounted();
  const max = Math.max(1, ...bars.map((b) => b.value));
  const peak = bars.reduce((p, b, i) => (b.value > bars[p].value ? i : p), 0);

  return (
    <div>
      <div className="flex h-52 items-end justify-between gap-2 sm:gap-3">
        {bars.map((b, i) => {
          const isPeak = i === peak && b.value > 0;
          const heightPct =
            b.value > 0 ? 42 + (b.value / max) * 58 : 58; // bos gunler hayalet pill
          const fill =
            b.value <= 0
              ? "bg-[repeating-linear-gradient(135deg,rgba(148,163,184,0.18)_0,rgba(148,163,184,0.18)_5px,transparent_5px,transparent_10px)]"
              : isPeak
                ? "bg-gradient-to-t from-green-800 to-emerald-500"
                : b.value >= max * 0.5
                  ? "bg-emerald-500"
                  : "bg-emerald-300 dark:bg-emerald-700";
          return (
            <div
              key={i}
              className="flex h-full flex-1 flex-col items-center justify-end"
            >
              <div className="relative flex h-full w-full items-end justify-center">
                {isPeak ? (
                  <span
                    className={`absolute z-10 -translate-y-1 rounded-md bg-card px-1.5 py-0.5 text-[11px] font-semibold text-foreground shadow ring-1 ring-border transition-opacity duration-700 ${
                      mounted ? "opacity-100" : "opacity-0"
                    }`}
                    style={{ bottom: `${heightPct}%` }}
                  >
                    {b.value}
                  </span>
                ) : null}
                <div
                  className={`w-7 rounded-full sm:w-9 ${fill} transition-[height] duration-700 ease-out`}
                  style={{
                    height: mounted ? `${heightPct}%` : "0%",
                    transitionDelay: `${i * 60}ms`,
                  }}
                />
              </div>
              <span className="mt-3 text-xs text-muted-foreground">{b.label}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{totalLabel}</p>
    </div>
  );
}

/* ---------- Half-donut gauge ---------- */

function HalfGauge({ gauge }: { gauge: GaugeData }) {
  const mounted = useMounted();
  const display = useCountUp(gauge.pct ?? 0, mounted, 1100);
  const r = 80;
  const len = Math.PI * r;
  const shown = mounted && gauge.pct !== null ? gauge.pct : 0;
  const offset = len * (1 - shown / 100);

  const legend = [
    { label: "Sağlam", value: gauge.healthy, dot: "bg-emerald-500" },
    { label: "Kritik", value: gauge.critical, dot: "bg-green-800" },
    { label: "Geçmiş", value: gauge.expired, dot: "bg-slate-300 dark:bg-slate-600" },
  ];

  return (
    <div className="flex flex-col items-center">
      {gauge.pct === null ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          Henüz stoklu bitmiş ürün lotu yok. İlk lotu girince burası canlanır.
        </p>
      ) : (
        <>
          <div className="relative mt-2 w-full max-w-[230px]">
            <svg viewBox="0 0 200 108" className="w-full">
              <defs>
                <linearGradient id="halfGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#166534" />
                  <stop offset="100%" stopColor="#34d399" />
                </linearGradient>
              </defs>
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke="rgba(148,163,184,0.22)"
                strokeWidth="18"
                strokeLinecap="round"
              />
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke="url(#halfGrad)"
                strokeWidth="18"
                strokeLinecap="round"
                strokeDasharray={len}
                strokeDashoffset={offset}
                style={{
                  transition:
                    "stroke-dashoffset 1100ms cubic-bezier(0.22,1,0.36,1)",
                  filter: "drop-shadow(0 4px 8px rgba(16,185,129,0.3))",
                }}
              />
            </svg>
            <div className="absolute inset-x-0 bottom-1 flex flex-col items-center">
              <span className="text-4xl font-bold tabular-nums">%{display}</span>
              <span className="text-xs text-muted-foreground">SKT güvende</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {legend.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${l.dot}`} />
                {l.label} <span className="font-semibold text-foreground">{l.value}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Live clock (Time-Tracker style) ---------- */

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now
    ? now.toLocaleTimeString("tr-TR", { hour12: false })
    : "--:--:--";
  const date = now
    ? now.toLocaleDateString("tr-TR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "";

  return (
    <div className="relative flex h-full min-h-[140px] flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-green-900 via-green-800 to-emerald-700 p-4 text-white shadow-[0_18px_40px_-18px_rgba(6,78,59,0.8)] sm:p-5">
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          background:
            "repeating-radial-gradient(circle at 80% 20%, rgba(255,255,255,0.16) 0, rgba(255,255,255,0.16) 1px, transparent 1px, transparent 14px)",
        }}
      />
      <p className="relative text-sm font-medium text-white/80">Canlı</p>
      <div className="relative">
        <p className="text-4xl font-bold tabular-nums tracking-tight">{time}</p>
        <p className="mt-1 text-sm capitalize text-white/80">{date}</p>
      </div>
    </div>
  );
}

/* ---------- Layout ---------- */

export function DashboardVisuals({
  kpis,
  weekly,
  weeklyTotalLabel,
  gauge,
  reminder,
  tasks,
  team,
  stockHref,
  membersHref,
  canManageTeam = true,
}: {
  kpis: KpiData[];
  weekly: WeeklyBar[];
  weeklyTotalLabel: string;
  gauge: GaugeData;
  reminder: ReminderData;
  tasks: TaskItem[];
  team: Member[];
  stockHref: string;
  membersHref?: string;
  canManageTeam?: boolean;
}) {
  return (
    <div className="space-y-5">
      {/* KPI satiri */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k, i) => (
          <KpiCard key={k.label} kpi={k} index={i} />
        ))}
      </section>

      {/* Grafik + Reminder + Görev listesi */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Stok Hareketi</h2>
            <Link
              href={stockHref}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors hover:bg-secondary/50"
            >
              Stoğa git
            </Link>
          </div>
          <div className="mt-5">
            <PillChart bars={weekly} totalLabel={weeklyTotalLabel} />
          </div>
        </Card>

        <Card className="flex flex-col lg:col-span-3">
          <h2 className="text-base font-semibold">Hatırlatma</h2>
          {reminder ? (
            <>
              <p className="mt-3 text-lg font-semibold leading-snug">
                {reminder.title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {reminder.subtitle}
              </p>
              <Link
                href={reminder.href}
                className="mt-auto inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                <Boxes className="h-4 w-4" />
                Stoğu Gör
              </Link>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Yaklaşan SKT yok. Stok girince burada en kritik lot görünür.
            </p>
          )}
        </Card>

        <Card className="lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Bekleyen İşler</h2>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Plus className="h-3.5 w-3.5" />
            </span>
          </div>
          <ul className="mt-4 space-y-1.5">
            {tasks.map((t) => {
              const Icon = ICONS[t.icon] ?? ClipboardList;
              return (
                <li key={t.label}>
                  <Link
                    href={t.href}
                    className="flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-secondary/50"
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${TONES[t.tone]}`}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {t.label}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {t.sub}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${
                        t.count > 0
                          ? TONES[t.tone]
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {t.count}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {/* Ekip + Yarim gosterge + Canli saat */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Ekip</h2>
            {canManageTeam && membersHref ? (
              <Link
                href={membersHref}
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors hover:bg-secondary/50"
              >
                <Plus className="h-3 w-3" />
                Üye Ekle
              </Link>
            ) : null}
          </div>
          {team.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {team.map((m) => (
                <li
                  key={m.name + m.role}
                  className="flex items-center gap-3 rounded-xl px-1.5 py-2"
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${TONES[m.tone]}`}
                  >
                    {m.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {m.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {m.role}
                    </span>
                  </span>
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    Aktif
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Henüz üye yok.</p>
          )}
        </Card>

        <Card className="lg:col-span-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Stok Sağlığı</h2>
            <Link
              href={stockHref}
              className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Detay →
            </Link>
          </div>
          <HalfGauge gauge={gauge} />
        </Card>

        <div className="lg:col-span-3">
          <LiveClock />
        </div>
      </div>
    </div>
  );
}
