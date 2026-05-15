"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/app", label: "Panel", exact: true },
  { href: "/app/products", label: "Ürünler" },
  { href: "/app/materials", label: "Hammaddeler" },
  { href: "/app/stock", label: "Stok" },
  { href: "/app/recipes", label: "Reçeteler" },
  { href: "/app/production", label: "Üretim" },
  { href: "/app/quality", label: "Kalite Kontrol" },
  { href: "/app/warehouse", label: "Depo Hareketleri" },
  { href: "/app/orders", label: "Siparişler" },
  { href: "/app/reports", label: "Raporlar" },
  { href: "/app/users", label: "Kullanıcılar" },
  { href: "/app/settings", label: "Ayarlar" },
];

export function CompanySidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3 text-sm">
      <p className="px-2 pb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        Firma
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
