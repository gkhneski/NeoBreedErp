import {
  ArrowLeftRight,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Gift,
  LayoutGrid,
  type LucideIcon,
  Printer,
  ScanBarcode,
  ScanLine,
  Send,
  ShoppingCart,
  Store,
} from "lucide-react";
import Link from "next/link";

const ICONS: Record<string, LucideIcon> = {
  scan: ScanLine,
  barcode: ScanBarcode,
  boxes: Boxes,
  grid: LayoutGrid,
  clipboard: ClipboardList,
  send: Send,
  cart: ShoppingCart,
  gift: Gift,
  store: Store,
  check: ClipboardCheck,
  printer: Printer,
  moves: ArrowLeftRight,
};

export type ShortcutBadge = {
  count: number;
  label: string;
  tone: "neutral" | "amber" | "rose";
};

export type Shortcut = {
  label: string;
  sub: string;
  href: string;
  icon: keyof typeof ICONS;
  primary?: boolean;
  badge?: ShortcutBadge | null;
};

const BADGE_TONE: Record<ShortcutBadge["tone"], string> = {
  neutral: "bg-secondary text-secondary-foreground",
  amber: "bg-amber-100 text-amber-800",
  rose: "bg-rose-100 text-rose-800",
};

// Depocunun paneli: iş akışındaki her adım bir kısayol. Sayılar canlı; sıfırsa
// gizlenir ki ekran sadece "yapılacak" olanı öne çıkarsın.
export function ClerkShortcuts({
  title,
  shortcuts,
}: {
  title: string;
  shortcuts: Shortcut[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shortcuts.map((s) => {
          const Icon = ICONS[s.icon] ?? Boxes;
          const badge = s.badge && s.badge.count > 0 ? s.badge : null;
          return (
            <Link
              key={s.href + s.label}
              href={s.href}
              className={
                s.primary
                  ? "group relative flex min-h-[132px] flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-green-800 to-emerald-500 p-4 text-white shadow-sm transition-transform hover:-translate-y-0.5"
                  : "group relative flex min-h-[132px] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-emerald-500/50 hover:bg-secondary/30"
              }
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={
                    s.primary
                      ? "inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/15"
                      : "inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700"
                  }
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                {badge ? (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
                      s.primary ? "bg-white/20 text-white" : BADGE_TONE[badge.tone]
                    }`}
                    title={badge.label}
                  >
                    {badge.count.toLocaleString("tr-TR")} {badge.label}
                  </span>
                ) : null}
              </div>
              <div className="space-y-0.5">
                <p className="text-base font-semibold leading-tight">{s.label}</p>
                <p
                  className={
                    s.primary ? "text-xs text-white/80" : "text-xs text-muted-foreground"
                  }
                >
                  {s.sub}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
