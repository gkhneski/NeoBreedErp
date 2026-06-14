"use client";

import {
  ArrowLeftRight,
  BarChart3,
  BookOpenText,
  Box,
  Building2,
  ClipboardList,
  Factory,
  FlaskConical,
  LayoutDashboard,
  Layers,
  Leaf,
  type LucideIcon,
  Package,
  ReceiptText,
  ScanBarcode,
  Send,
  Settings,
  ShieldCheck,
  Store,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import {
  STOCK_WRITE_ROLES,
  canAccessModule,
  canWriteCompanyData,
  companyHomePath,
  companyModulePath,
  type CompanyRole,
} from "@/types/roles";

interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: "Ürün & Stok",
    items: [
      { key: "products", label: "Ürünler", icon: Package },
      { key: "materials", label: "Hammaddeler", icon: FlaskConical },
      { key: "packaging", label: "Ambalaj Malzemeleri", icon: Box },
      { key: "lots", label: "Lotlar", icon: Layers },
      { key: "lots/onboarding", label: "Stok Girişi (Barkod)", icon: ScanBarcode },
      { key: "stock", label: "Stok", icon: Warehouse },
      { key: "warehouse", label: "Depo Hareketleri", icon: ArrowLeftRight },
    ],
  },
  {
    title: "Tedarik & Müşteriler",
    items: [
      { key: "suppliers", label: "Tedarikçiler", icon: Truck },
      { key: "customers", label: "Müşteriler", icon: Building2 },
      { key: "purchases", label: "Fatura / İrsaliye", icon: ReceiptText },
    ],
  },
  {
    title: "Üretim",
    items: [
      { key: "recipes", label: "Reçeteler", icon: BookOpenText },
      { key: "production", label: "Üretim", icon: Factory },
      { key: "quality", label: "Kalite Kontrol", icon: ShieldCheck },
      { key: "orders", label: "Üretim İş Listesi", icon: ClipboardList },
    ],
  },
  {
    title: "Sevkiyat",
    items: [
      { key: "shipments", label: "Siparişler", icon: Send },
      { key: "marketplace", label: "Pazaryeri", icon: Store },
    ],
  },
  {
    title: "Yönetim",
    items: [
      { key: "reports", label: "Raporlar", icon: BarChart3 },
      { key: "users", label: "Kullanıcılar", icon: Users },
      { key: "settings", label: "Ayarlar", icon: Settings },
    ],
  },
];

function isItemActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact
    ? pathname === href
    : pathname === href || pathname.startsWith(href + "/");
}

function itemClass(active: boolean): string {
  return cn(
    "relative flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition-colors",
    active
      ? "bg-sidebar-active text-sidebar-accent before:absolute before:-left-3 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-full before:bg-sidebar-accent"
      : "text-sidebar-foreground hover:bg-sidebar-active/50 hover:text-foreground",
  );
}

export function CompanySidebar({
  companyId,
  companyName,
  role,
}: {
  companyId: string;
  companyName: string;
  role: CompanyRole;
}) {
  const pathname = usePathname();
  const home = companyHomePath(companyId);
  const homeActive = pathname === home;

  const sections = SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((item) => canAccessModule(role, item.key)),
  })).filter((s) => s.items.length > 0);

  const canStockIn = canWriteCompanyData(role, STOCK_WRITE_ROLES);

  return (
    <div className="flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <Link
        href={home}
        className="flex items-center gap-2.5 border-b border-sidebar-border px-5 py-4"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-green-600 to-emerald-500 text-white shadow-sm">
          <Leaf className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-bold tracking-tight text-foreground">
            NeoBreed-ERP
          </span>
          <span className="truncate text-xs text-sidebar-muted">
            {companyName}
          </span>
        </span>
      </Link>

      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 py-4 text-sm">
        <Link href={home} className={itemClass(homeActive)}>
          <LayoutDashboard className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          <span>Panel</span>
        </Link>

        {sections.map((section) => (
          <div key={section.title} className="mt-5">
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const href = companyModulePath(companyId, item.key);
                const active = isItemActive(pathname, href, item.exact);
                const Icon = item.icon;
                return (
                  <Link key={item.key} href={href} className={itemClass(active)}>
                    <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {canStockIn ? (
        <div className="p-3">
          <Link
            href={companyModulePath(companyId, "lots", "onboarding")}
            className="relative block overflow-hidden rounded-2xl bg-gradient-to-br from-green-900 via-green-800 to-emerald-700 p-4 text-white shadow-[0_12px_30px_-14px_rgba(6,78,59,0.8)]"
          >
            <div
              className="pointer-events-none absolute -right-6 -bottom-8 h-28 w-28 rounded-full opacity-30"
              style={{
                background:
                  "repeating-radial-gradient(circle at center, rgba(255,255,255,0.18) 0, rgba(255,255,255,0.18) 1px, transparent 1px, transparent 12px)",
              }}
            />
            <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm">
              <ScanBarcode className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="relative mt-3 text-sm font-semibold leading-tight">
              Tarayarak Stok Girişi
            </p>
            <p className="relative mt-1 text-xs text-white/70">
              Barkod okut, ürünü ekle
            </p>
            <span className="relative mt-3 flex w-full items-center justify-center rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold backdrop-blur-sm transition-colors hover:bg-white/25">
              Başla
            </span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
