"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/superadmin", label: "Platform Özeti", exact: true },
  { href: "/superadmin/companies", label: "Firmalar" },
  { href: "/superadmin/companies/new", label: "Firma Ekle" },
  { href: "/superadmin/subscriptions", label: "Abonelikler" },
  { href: "/superadmin/users", label: "Firma Adminleri" },
];

export function PlatformSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3 text-sm">
      <p className="px-2 pb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        Platform
      </p>
      {NAV.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-2 transition-colors",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
