"use client";

import {
  ArrowUpRight,
  BookOpenText,
  Factory,
  FlaskConical,
  Package,
  Send,
  ShieldCheck,
  Store,
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
  book: BookOpenText,
  shield: ShieldCheck,
};

export type KpiData = {
  label: string;
  value: number;
  sub: string;
  href: string;
  icon: keyof typeof ICONS;
  hero?: boolean;
};
export type WeeklyBar = { label: string; value: number };
export type SoonItem = {
  id: string;
  name: string;
  lot: string;
  date: string;
  badge: string | null;
  badgeClass: string;
};
export type ActionData = {
  label: string;
  description: string;
  href: string;
  icon: keyof typeof ICONS;
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
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, mounted, duration]);
  return v;
}

function KpiCard({ kpi, index }: { kpi: KpiData; index: number }) {
  const mounted = useMounted();
  const display = useCountUp(kpi.value, mounted);
  const Icon = ICONS[kpi.icon] ?? Package;

  if (kpi.hero) {
    return (
      <Link
        href={kpi.href}
        style={{ transitionDelay: `${index * 70}ms` }}
        className={`group relative overflow-hidden rounded-3xl bg-gradient-to-br from-green-700 via-green-600 to-emerald-500 p-5 text-white shadow-[0_18px_40px_-18px_rgba(5,150,105,0.7)] transition-all duration-500 ease-out hover:-translate-y-1 ${
          mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
      >
        <div
          className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full opacity-30"
          style={{
            background:
              "radial-gradient(circle, rgba(255,255,255,0.55) 0%, transparent 70%)",
          }}
        />
        <div className="relative flex items-start justify-between">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <ArrowUpRight className="h-5 w-5 text-white/70 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
        <p className="relative mt-5 text-5xl font-bold tabular-nums tracking-tight">
          {display}
        </p>
        <p className="relative mt-1 text-sm font-semibold text-white/95">
          {kpi.label}
        </p>
        <p className="relative mt-0.5 text-xs text-white/75">{kpi.sub}</p>
      </Link>
    );
  }

  return (
    <Link
      href={kpi.href}
      style={{ transitionDelay: `${index * 70}ms` }}
      className={`group rounded-3xl border border-border bg-card p-5 shadow-sm transition-all duration-500 ease-out hover:-translate-y-1 hover:border-emerald-500/50 hover:shadow-[0_14px_30px_-18px_rgba(5,150,105,0.55)] ${
        mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <div className="flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <ArrowUpRight className="h-5 w-5 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-emerald-600" />
      </div>
      <p className="mt-5 text-4xl font-bold tabular-nums tracking-tight">
        {display}
      </p>
      <p className="mt-1 text-sm font-semibold">{kpi.label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{kpi.sub}</p>
    </Link>
  );
}

function WeeklyChart({ bars, totalLabel }: { bars: WeeklyBar[]; totalLabel: string }) {
  const mounted = useMounted();
  const max = Math.max(1, ...bars.map((b) => b.value));
  const peak = bars.reduce((p, b, i) => (b.value > bars[p].value ? i : p), 0);

  return (
    <div className="relative mt-6">
      {/* grid cizgileri */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex h-48 flex-col justify-between">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="border-t border-dashed border-border/60" />
        ))}
      </div>
      <div className="relative flex h-48 items-end gap-2 sm:gap-3">
        {bars.map((b, i) => {
          const pct = (b.value / max) * 100;
          const isPeak = i === peak && b.value > 0;
          return (
            <div key={i} className="flex flex-1 flex-col items-center justify-end">
              <div className="relative flex h-full w-full items-end justify-center">
                {isPeak ? (
                  <span
                    className={`absolute -top-1 z-10 rounded-lg bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background shadow transition-opacity duration-700 ${
                      mounted ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    {b.value}
                  </span>
                ) : null}
                <div
                  className={`w-full max-w-[44px] rounded-t-xl transition-[height] duration-700 ease-out ${
                    isPeak
                      ? "bg-gradient-to-t from-green-700 to-emerald-500"
                      : "bg-gradient-to-t from-emerald-200 to-emerald-400 dark:from-emerald-900 dark:to-emerald-600"
                  }`}
                  style={{
                    height: mounted ? `${Math.max(6, pct)}%` : "0%",
                    transitionDelay: `${i * 60}ms`,
                  }}
                />
              </div>
              <span className="mt-2 text-xs text-muted-foreground">{b.label}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{totalLabel}</p>
    </div>
  );
}

function HealthGauge({
  pct,
  healthy,
  stocked,
}: {
  pct: number | null;
  healthy: number;
  stocked: number;
}) {
  const mounted = useMounted();
  const display = useCountUp(pct ?? 0, mounted, 1100);
  const r = 70;
  const c = 2 * Math.PI * r;
  const shown = mounted && pct !== null ? pct : 0;
  const offset = c * (1 - shown / 100);

  if (pct === null) {
    return (
      <p className="mt-10 text-center text-sm text-muted-foreground">
        Henüz stoklu bitmiş ürün lotu yok. İlk lotu girince burası canlanır.
      </p>
    );
  }

  return (
    <>
      <div className="relative mt-5 h-44 w-44">
        <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
          <defs>
            <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#15803d" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>
          </defs>
          <circle
            cx="80"
            cy="80"
            r={r}
            fill="none"
            stroke="rgba(148,163,184,0.22)"
            strokeWidth="14"
          />
          <circle
            cx="80"
            cy="80"
            r={r}
            fill="none"
            stroke="url(#gaugeGrad)"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{
              transition: "stroke-dashoffset 1100ms cubic-bezier(0.22,1,0.36,1)",
              filter: "drop-shadow(0 4px 8px rgba(16,185,129,0.35))",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold tabular-nums">%{display}</span>
          <span className="text-xs text-muted-foreground">SKT güvende</span>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        {healthy} / {stocked} lotun son kullanma tarihi güvenli aralıkta.
      </p>
    </>
  );
}

export function DashboardVisuals({
  kpis,
  weekly,
  weeklyTotalLabel,
  healthyPct,
  healthy,
  stocked,
  soonest,
  actions,
  stockHref,
}: {
  kpis: KpiData[];
  weekly: WeeklyBar[];
  weeklyTotalLabel: string;
  healthyPct: number | null;
  healthy: number;
  stocked: number;
  soonest: SoonItem[];
  actions: ActionData[];
  stockHref: string;
}) {
  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k, i) => (
          <KpiCard key={k.label} kpi={k} index={i} />
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Haftalık Stok Hareketi</h2>
              <p className="text-xs text-muted-foreground">Son 7 gün</p>
            </div>
            <Link
              href={stockHref}
              className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Stoğa git →
            </Link>
          </div>
          <WeeklyChart bars={weekly} totalLabel={weeklyTotalLabel} />
        </section>

        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Yaklaşan SKT</h2>
          {soonest.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {soonest.map((s) => (
                <li key={s.id}>
                  <Link
                    href={stockHref}
                    className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-secondary/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {s.name}
                      </span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {s.lot} · {s.date}
                      </span>
                    </span>
                    {s.badge ? (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.badgeClass}`}
                      >
                        {s.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Yaklaşan SKT yok.</p>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold">Hızlı İşlemler</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {actions.map((a) => {
              const Icon = ICONS[a.icon] ?? Package;
              return (
                <Link
                  key={a.label}
                  href={a.href}
                  className="group flex items-start gap-3 rounded-2xl border border-border p-3 transition-all hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-sm"
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

        <section className="flex flex-col items-center rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex w-full items-center justify-between">
            <h2 className="text-sm font-semibold">Stok Sağlığı</h2>
            <Link
              href={stockHref}
              className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Detay →
            </Link>
          </div>
          <HealthGauge pct={healthyPct} healthy={healthy} stocked={stocked} />
        </section>
      </div>
    </div>
  );
}
