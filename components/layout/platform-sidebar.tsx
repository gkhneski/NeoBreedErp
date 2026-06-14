"use client";

import {
  Building2,
  CreditCard,
  LayoutDashboard,
  Leaf,
  LogOut,
  type LucideIcon,
  PlusCircle,
  ScrollText,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOut } from "@/app/login/actions";
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

function itemClass(active: boolean): string {
  return cn(
    "relative flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition-colors",
    active
      ? "bg-sidebar-active text-sidebar-accent before:absolute before:-left-3 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-full before:bg-sidebar-accent"
      : "text-sidebar-foreground hover:bg-sidebar-active/50 hover:text-foreground",
  );
}

export function PlatformSidebar({ email = "" }: { email?: string }) {
  const pathname = usePathname();
  const emailName = email.split("@")[0] || email || "Süper Admin";
  const initials = emailName.slice(0, 2).toUpperCase() || "SA";

  return (
    <div className="flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <Link
        href="/superadmin"
        className="flex items-center gap-2.5 border-b border-sidebar-border px-5 py-4"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-green-600 to-emerald-500 text-white shadow-sm">
          <Leaf className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-bold tracking-tight text-foreground">
            NeoBreed-ERP
          </span>
          <span className="text-xs font-semibold uppercase tracking-widest text-destructive">
            Platform
          </span>
        </span>
      </Link>

      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 py-4 text-sm">
        <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
          Yönetim
        </p>
        <div className="space-y-0.5">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={itemClass(active)}>
                <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-xs font-bold text-destructive">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {emailName}
            </p>
            <p className="truncate text-xs text-sidebar-muted">Süper Admin</p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              title="Çıkış Yap"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-active/60 hover:text-foreground"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
