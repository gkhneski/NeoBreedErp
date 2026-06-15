"use client";

import {
  Banknote,
  Boxes,
  Flame,
  ImageOff,
  Receipt,
  Search,
  ShoppingBag,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export type SalesKpis = {
  revenue: number;
  orders: number;
  units: number;
  avgBasket: number;
};
export type RevenueBar = { label: string; value: number };
export type ProductCard = {
  barcode: string;
  title: string;
  imageUrl: string | null;
  units: number;
  price: number | null;
  appliedPrice: number | null;
  stock: number | null;
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
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, mounted, duration]);
  return v;
}

const tl = (n: number) => Math.round(n).toLocaleString("tr-TR");
const money = (n: number) => `${tl(n)} ₺`;

/* ---------- KPI ---------- */

const KPI_TONE: Record<string, string> = {
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-500",
};

function KpiCard({
  icon: Icon,
  label,
  value,
  fmt,
  tone,
  index,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  fmt: (n: number) => string;
  tone: keyof typeof KPI_TONE;
  index: number;
}) {
  const mounted = useMounted();
  const display = useCountUp(value, mounted);
  return (
    <div
      style={{ transitionDelay: `${index * 70}ms` }}
      className={`rounded-3xl border border-border bg-card p-4 shadow-[0_2px_12px_-6px_rgba(0,0,0,0.12)] transition-all duration-500 ease-out sm:p-5 ${
        mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full ${KPI_TONE[tone]}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight sm:text-4xl">
        {fmt(display)}
      </p>
    </div>
  );
}

/* ---------- Revenue chart ---------- */

function RevenueChart({ bars }: { bars: RevenueBar[] }) {
  const mounted = useMounted();
  const max = Math.max(1, ...bars.map((b) => b.value));
  const peak = bars.reduce((p, b, i) => (b.value > bars[p].value ? i : p), 0);
  const total = bars.reduce((s, b) => s + b.value, 0);

  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-[0_2px_12px_-6px_rgba(0,0,0,0.12)] sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Günlük Ciro (son 14 gün)</h2>
        <span className="text-xs text-muted-foreground">
          Toplam {money(total)}
        </span>
      </div>
      <div className="mt-5 flex h-44 items-end justify-between gap-1.5">
        {bars.map((b, i) => {
          const isPeak = i === peak && b.value > 0;
          const heightPct = b.value > 0 ? 12 + (b.value / max) * 88 : 4;
          return (
            <div
              key={i}
              className="flex h-full flex-1 flex-col items-center justify-end"
            >
              <div className="relative flex h-full w-full items-end justify-center">
                {isPeak ? (
                  <span
                    className={`absolute z-10 -translate-y-1 whitespace-nowrap rounded-md bg-card px-1.5 py-0.5 text-[10px] font-semibold text-foreground shadow ring-1 ring-border transition-opacity duration-700 ${
                      mounted ? "opacity-100" : "opacity-0"
                    }`}
                    style={{ bottom: `${heightPct}%` }}
                  >
                    {money(b.value)}
                  </span>
                ) : null}
                <div
                  className={`w-full max-w-[22px] rounded-full transition-[height] duration-700 ease-out ${
                    b.value <= 0
                      ? "bg-secondary"
                      : isPeak
                        ? "bg-gradient-to-t from-green-800 to-emerald-500"
                        : "bg-emerald-400 dark:bg-emerald-600"
                  }`}
                  style={{
                    height: mounted ? `${heightPct}%` : "0%",
                    transitionDelay: `${i * 45}ms`,
                  }}
                />
              </div>
              <span className="mt-2 text-[10px] text-muted-foreground">
                {b.label}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- Lightbox ---------- */

function Lightbox({
  product,
  onClose,
}: {
  product: ProductCard;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const discounted =
    product.appliedPrice !== null &&
    product.price !== null &&
    product.appliedPrice < product.price;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-card shadow-2xl animate-in zoom-in-95 duration-200 sm:flex-row">
        <button
          type="button"
          onClick={onClose}
          aria-label="Kapat"
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex aspect-square w-full items-center justify-center bg-secondary sm:max-w-[60%]">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.title}
              className="h-full w-full object-contain"
            />
          ) : (
            <ImageOff className="h-16 w-16 text-muted-foreground" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
          <h3 className="text-lg font-semibold leading-snug">{product.title}</h3>
          <p className="font-mono text-xs text-muted-foreground">
            {product.barcode}
          </p>
          <div className="mt-1 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-emerald-500/10 p-3">
              <p className="text-xs text-muted-foreground">30 günde satış</p>
              <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {tl(product.units)}{" "}
                <span className="text-sm font-medium">adet</span>
              </p>
            </div>
            <div className="rounded-2xl bg-secondary/60 p-3">
              <p className="text-xs text-muted-foreground">Eldeki stok</p>
              <p className="text-2xl font-bold tabular-nums">
                {product.stock === null ? "—" : tl(product.stock)}{" "}
                {product.stock !== null ? (
                  <span className="text-sm font-medium">adet</span>
                ) : null}
              </p>
            </div>
          </div>
          {product.price !== null ? (
            <div className="mt-auto flex items-baseline gap-2">
              {discounted ? (
                <>
                  <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {money(product.appliedPrice as number)}
                  </span>
                  <span className="text-sm text-muted-foreground line-through">
                    {money(product.price)}
                  </span>
                </>
              ) : (
                <span className="text-2xl font-bold">{money(product.price)}</span>
              )}
            </div>
          ) : (
            <p className="mt-auto text-sm text-muted-foreground">
              Bu ürün henüz bir Trendyol listingiyle eşleşmemiş.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Product grid ---------- */

function ProductGrid({ products }: { products: ProductCard[] }) {
  const mounted = useMounted();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ProductCard | null>(null);

  const q = query.trim().toLocaleLowerCase("tr");
  const filtered = useMemo(
    () =>
      q === ""
        ? products
        : products.filter((p) =>
            `${p.title} ${p.barcode}`.toLocaleLowerCase("tr").includes(q),
          ),
    [products, q],
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          Ürünler{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({products.length})
          </span>
        </h2>
        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ürün ara: ad veya barkod…"
            className="h-9 w-full rounded-full border border-input bg-background pl-9 pr-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          Eşleşen ürün yok.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((p, i) => {
            const discounted =
              p.appliedPrice !== null &&
              p.price !== null &&
              p.appliedPrice < p.price;
            const isTop = i === 0 && q === "" && p.units > 0;
            return (
              <button
                key={p.barcode}
                type="button"
                onClick={() => setSelected(p)}
                style={{ transitionDelay: `${Math.min(i, 12) * 40}ms` }}
                className={`group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-[0_2px_12px_-6px_rgba(0,0,0,0.12)] transition-all duration-500 ease-out hover:-translate-y-1 hover:border-emerald-500/50 hover:shadow-[0_14px_30px_-18px_rgba(5,150,105,0.55)] ${
                  mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
                }`}
              >
                <div className="relative aspect-square w-full overflow-hidden bg-secondary">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt={p.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageOff className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  {p.units > 0 ? (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
                      <Flame className="h-3 w-3" />
                      {tl(p.units)} satış
                    </span>
                  ) : null}
                  {isTop ? (
                    <span className="absolute right-2 top-2 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      En çok satan
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-3">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">
                    {p.title}
                  </p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    {p.barcode}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    {p.price !== null ? (
                      discounted ? (
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                          {money(p.appliedPrice as number)}
                        </span>
                      ) : (
                        <span className="text-sm font-bold">
                          {money(p.price)}
                        </span>
                      )
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        Listing yok
                      </span>
                    )}
                    {p.stock !== null ? (
                      <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {tl(p.stock)} stok
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected ? (
        <Lightbox product={selected} onClose={() => setSelected(null)} />
      ) : null}
    </section>
  );
}

/* ---------- Layout ---------- */

export function SalesVisuals({
  kpis,
  revenueSeries,
  products,
}: {
  kpis: SalesKpis;
  revenueSeries: RevenueBar[];
  products: ProductCard[];
}) {
  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          index={0}
          icon={Banknote}
          label="Ciro (30 gün)"
          value={kpis.revenue}
          fmt={money}
          tone="emerald"
        />
        <KpiCard
          index={1}
          icon={ShoppingBag}
          label="Sipariş (30 gün)"
          value={kpis.orders}
          fmt={tl}
          tone="blue"
        />
        <KpiCard
          index={2}
          icon={Boxes}
          label="Satılan Adet (30 gün)"
          value={kpis.units}
          fmt={tl}
          tone="violet"
        />
        <KpiCard
          index={3}
          icon={Receipt}
          label="Ortalama Sepet"
          value={kpis.avgBasket}
          fmt={money}
          tone="amber"
        />
      </section>

      <RevenueChart bars={revenueSeries} />

      <ProductGrid products={products} />
    </div>
  );
}
