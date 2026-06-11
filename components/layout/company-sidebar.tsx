"use client";

import {
  ArrowLeftRight,
  BarChart3,
  Box,
  ClipboardList,
  Factory,
  FlaskConical,
  LayoutDashboard,
  Layers,
  type LucideIcon,
  Package,
  ReceiptText,
  Settings,
  ShieldCheck,
  BookOpenText,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { companyHomePath, companyModulePath } from "@/types/roles";

interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

interface NavSection {
  title: string | null;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: null,
    items: [{ key: "", label: "Panel", icon: LayoutDashboard, exact: true }],
  },
  {
    title: "Ürün & Stok",
    items: [
      { key: "products", label: "Ürünler", icon: Package },
      { key: "materials", label: "Hammaddeler", icon: FlaskConical },
      { key: "packaging", label: "Ambalaj Malzemeleri", icon: Box },
      { key: "lots", label: "Lotlar", icon: Layers },
      { key: "stock", label: "Stok", icon: Warehouse },
      { key: "warehouse", label: "Depo Hareketleri", icon: ArrowLeftRight },
    ],
  },
  {
    title: "Tedarik",
    items: [
      { key: "suppliers", label: "Tedarikçiler", icon: Truck },
      { key: "purchases", label: "Fatura / İrsaliye", icon: ReceiptText },
    ],
  },
  {
    title: "Üretim",
    items: [
      { key: "recipes", label: "Reçeteler", icon: BookOpenText },
      { key: "production", label: "Üretim", icon: Factory },
      { key: "quality", label: "Kalite Kontrol", icon: ShieldCheck },
      { key: "orders", label: "Siparişler", icon: ClipboardList },
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

export function CompanySidebar({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const pathname = usePathname();
  const home = companyHomePath(companyId);

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Link
        href={home}
        className="flex flex-col gap-0.5 border-b border-sidebar-border px-5 py-4"
      >
        <span className="text-sm font-semibold tracking-tight text-white">
          NeoBreed-ERP
        </span>
        <span className="truncate text-xs text-sidebar-muted">
          {companyName}
        </span>
      </Link>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 text-sm">
        {SECTIONS.map((section) => (
          <div key={section.title ?? "main"} className="space-y-0.5">
            {section.title ? (
              <p className="px-3 pb-1 text-[10px] font-medium uppercase tracking-widest text-sidebar-muted">
                {section.title}
              </p>
            ) : null}
            {section.items.map((item) => {
              const href = item.key
                ? companyModulePath(companyId, item.key)
                : home;
              const active = item.exact
                ? pathname === href
                : pathname === href || pathname.startsWith(href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.key || "home"}
                  href={href}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-md px-3 py-2 transition-colors",
                    active
                      ? "bg-sidebar-active text-sidebar-accent before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-accent"
                      : "hover:bg-sidebar-active/60 hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}
