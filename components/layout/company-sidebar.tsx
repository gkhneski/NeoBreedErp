"use client";

import {
  ArrowLeftRight,
  BarChart3,
  BookOpenText,
  Box,
  ChevronDown,
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
  Truck,
  Users,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { companyHomePath, companyModulePath } from "@/types/roles";

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

function isItemActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact
    ? pathname === href
    : pathname === href || pathname.startsWith(href + "/");
}

export function CompanySidebar({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const pathname = usePathname();
  const home = companyHomePath(companyId);

  const activeSection = SECTIONS.find((s) =>
    s.items.some((item) =>
      isItemActive(pathname, companyModulePath(companyId, item.key)),
    ),
  )?.title;

  const [open, setOpen] = useState<Record<string, boolean>>(() => ({
    ...(activeSection ? { [activeSection]: true } : {}),
  }));

  useEffect(() => {
    if (activeSection) {
      setOpen((prev) => ({ ...prev, [activeSection]: true }));
    }
  }, [activeSection]);

  const homeActive = pathname === home;

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

      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 py-4 text-sm">
        <Link
          href={home}
          className={cn(
            "relative flex items-center gap-2.5 rounded-md px-3 py-2 transition-colors",
            homeActive
              ? "bg-sidebar-active text-sidebar-accent before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-accent"
              : "hover:bg-sidebar-active/60 hover:text-white",
          )}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Panel</span>
        </Link>

        <div className="mt-3 space-y-1">
          {SECTIONS.map((section) => {
            const expanded = !!open[section.title];
            return (
              <div key={section.title}>
                <button
                  type="button"
                  onClick={() =>
                    setOpen((prev) => ({
                      ...prev,
                      [section.title]: !expanded,
                    }))
                  }
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-[11px] font-medium uppercase tracking-widest text-sidebar-muted transition-colors hover:bg-sidebar-active/60 hover:text-white"
                >
                  <span>{section.title}</span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform duration-200",
                      expanded ? "rotate-180" : "",
                    )}
                    aria-hidden="true"
                  />
                </button>

                {expanded ? (
                  <div className="space-y-0.5 pb-1">
                    {section.items.map((item) => {
                      const href = companyModulePath(companyId, item.key);
                      const active = isItemActive(pathname, href);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.key}
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
                ) : null}
              </div>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
