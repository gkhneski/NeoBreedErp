"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { companyHomePath, companyModulePath } from "@/types/roles";

const MODULES = [
  { key: "", label: "Panel", exact: true },
  { key: "materials", label: "Hammaddeler" },
  { key: "suppliers", label: "Tedarikçiler" },
  { key: "lots", label: "Lotlar" },
  { key: "stock", label: "Stok Hareketleri" },
  { key: "recipes", label: "Reçeteler" },
  { key: "production", label: "Üretim" },
  { key: "quality", label: "Kalite Kontrol" },
];

export function CompanySidebar({ companyId }: { companyId: string }) {
  const pathname = usePathname();
  const home = companyHomePath(companyId);

  return (
    <nav className="flex flex-col gap-1 p-3 text-sm">
      <p className="px-2 pb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        Firma
      </p>
      {MODULES.map((item) => {
        const href = item.key ? companyModulePath(companyId, item.key) : home;
        const active = item.exact
          ? pathname === href
          : pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={item.key || "home"}
            href={href}
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
