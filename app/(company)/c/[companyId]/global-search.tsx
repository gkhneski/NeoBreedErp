"use client";

import { Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { globalSearch, type SearchResult } from "./search-actions";

const TYPE_TONE: Record<string, string> = {
  Ürün: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  Hammadde: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  Lot: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  Tedarikçi: "bg-amber-500/10 text-amber-600 dark:text-amber-500",
  Müşteri: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  Kullanıcı: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

export function GlobalSearch({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      const r = await globalSearch(companyId, q);
      setResults(r);
      setActive(0);
      setOpen(true);
      setLoading(false);
    }, 220);
    return () => clearTimeout(handle);
  }, [query, companyId]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(r: SearchResult) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(r.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[active];
      if (r) go(r);
    }
  }

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative w-full min-w-0 max-w-xl">
      <div className="flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Ara: ürün, hammadde, lot, tedarikçi, kullanıcı…"
          className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {showDropdown ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-border bg-popover shadow-xl">
          {results.length > 0 ? (
            <ul className="max-h-[60vh] overflow-y-auto py-1.5">
              {results.map((r, i) => (
                <li key={`${r.type}-${r.href}-${i}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                      i === active ? "bg-secondary/70" : "hover:bg-secondary/50"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {r.label}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.sub}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        TYPE_TONE[r.type] ?? "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {r.type}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : loading ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Aranıyor…
            </p>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              &quot;{query.trim()}&quot; için sonuç yok.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
