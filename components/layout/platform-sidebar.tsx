"use client";

import {
  Building2,
  CreditCard,
  LayoutDashboard,
  type LucideIcon,
  PlusCircle,
  ScrollText,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

const NAV: NavItem[] = [
  { href: "/superadmin", label: "Platform Özeti", icon: LayoutDashboard, exact: true },
  { href: "/superadmin/companies", label: "Firmalar", icon: Building2 },
  { href: "/superadmin/companies/new", label: "Firma Ekle", icon: PlusCircle },
  { href: "/superadmin/subscriptions", label: "Abonelikler", icon: CreditCard },
  { href: "/superadmin/users", label: "Firma Adminleri", icon: Users },
  { href: "/superadmin/audit", label: "Denetim Kaydı", icon: ScrollText },
];

export function PlatformSidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Link
        href="/superadmin"
        className="flex flex-col gap-0.5 border-b border-sidebar-border px-5 py-4"
      >
        <span className="text-sm font-semibold tracking-tight text-white">
          NeoBreed-ERP
        </span>
        <span className="text-xs font-medium uppercase tracking-widest text-destructive">
          Platform
        </span>
      </Link>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4 text-sm">
        {NAV.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
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
      </nav>
    </div>
  );
}
