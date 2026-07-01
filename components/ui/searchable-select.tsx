"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  name: string;
  options: Option[];
  id?: string;
  placeholder?: string;
  defaultValue?: string;
  limit?: number;
}

// Diacritic-insensitive, case-insensitive normalization (ASKORBİK → askorbik).
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function SearchableSelect({
  name,
  options,
  id,
  placeholder = "Ara / seç…",
  defaultValue = "",
  limit = 50,
}: SearchableSelectProps) {
  const [value, setValue] = useState(defaultValue);
  const [query, setQuery] = useState(
    () => options.find((o) => o.value === defaultValue)?.label ?? "",
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q || query === selectedLabel) return options.slice(0, limit);
    return options.filter((o) => norm(o.label).includes(q)).slice(0, limit);
  }, [query, options, selectedLabel, limit]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(o: Option) {
    setValue(o.value);
    setQuery(o.label);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <input type="hidden" name={name} value={value} />
      <input
        id={id}
        type="text"
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setValue("");
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            if (open && filtered[active]) {
              e.preventDefault();
              choose(filtered[active]);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {open ? (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md">
          {filtered.length === 0 ? (
            <li className="px-2 py-1.5 text-muted-foreground">Sonuç yok</li>
          ) : (
            filtered.map((o, i) => (
              <li key={o.value}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(o);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "block w-full truncate rounded px-2 py-1.5 text-left",
                    i === active ? "bg-secondary" : "hover:bg-secondary/60",
                  )}
                >
                  {o.label}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
