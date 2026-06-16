"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { portalHomePath } from "@/types/roles";

export function PortalNav({ companyId }: { companyId: string }) {
  const pathname = usePathname();
  const home = portalHomePath(companyId);
  const items = [
    { href: home, label: "Katalog", exact: true },
    { href: `${home}/orders`, label: "Siparişlerim", exact: false },
  ];

  return (
    <nav className="hidden items-center gap-1 sm:flex">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-emerald-600 text-white"
                : "text-muted-foreground hover:bg-secondary",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
