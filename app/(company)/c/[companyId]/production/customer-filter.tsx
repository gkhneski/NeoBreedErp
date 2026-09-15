"use client";

import { usePathname, useRouter } from "next/navigation";

import {
  SearchableSelect,
  type SearchableOption,
} from "@/components/ui/searchable-select";

interface CustomerFilterProps {
  options: SearchableOption[];
  value: string;
}

export function CustomerFilter({ options, value }: CustomerFilterProps) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="space-y-1">
      <label
        htmlFor="customer"
        className="text-xs font-medium text-muted-foreground"
      >
        Müşteriye göre filtrele
      </label>
      <SearchableSelect
        id="customer"
        options={options}
        emptyLabel="Tümü"
        placeholder="Müşteri ara…"
        value={value}
        onChange={(next) => {
          router.push(
            next ? `${pathname}?customer=${encodeURIComponent(next)}` : pathname,
          );
        }}
        className="w-64"
      />
    </div>
  );
}
