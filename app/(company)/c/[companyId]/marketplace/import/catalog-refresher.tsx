"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { refreshRemoteCatalog } from "./actions";

const AUTO_MS = 10 * 60 * 1000; // 10 dakika

export function CatalogRefresher({
  companyId,
  lastFetched,
  count,
}: {
  companyId: string;
  lastFetched: string | null;
  count: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const didInitial = useRef(false);

  const run = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const res = await refreshRemoteCatalog(companyId);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }, [companyId, router]);

  // İlk açılışta hiç ürün yoksa otomatik çek.
  useEffect(() => {
    if (count === 0 && !didInitial.current) {
      didInitial.current = true;
      run();
    }
  }, [count, run]);

  // Ekran açıkken 10 dakikada bir otomatik tazele.
  useEffect(() => {
    const id = setInterval(run, AUTO_MS);
    return () => clearInterval(id);
  }, [run]);

  const lastLabel = lastFetched
    ? new Date(lastFetched).toLocaleString("tr-TR")
    : "henüz çekilmedi";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-sm">
        <span className="font-medium">{count}</span> ürün ·{" "}
        <span className="text-muted-foreground">
          Son güncelleme: {pending ? "yenileniyor…" : lastLabel}
        </span>
        {error ? (
          <span className="ml-2 text-destructive">— {error}</span>
        ) : (
          <span className="ml-2 text-xs text-muted-foreground">
            (10 dakikada bir otomatik yenilenir)
          </span>
        )}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={pending}>
        <RefreshCw className={`mr-1.5 h-4 w-4 ${pending ? "animate-spin" : ""}`} />
        {pending ? "Yenileniyor…" : "Yenile"}
      </Button>
    </div>
  );
}
