"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { applyPackSizes, convertLotsToBoxes } from "./actions";

export type PackRow = {
  materialId: string;
  name: string;
  stored: number;
  auto: number;
  kind: "solid" | "liquid" | "unknown";
  suggested: number;
};
export type LotRow = {
  lotId: string;
  lotNumber: string;
  productName: string;
  location: string;
  currentQty: number;
  pack: number;
  boxes: number;
  convertible: boolean;
  clean: boolean;
};

const nf = (n: number, max = 2) =>
  Number(n).toLocaleString("tr-TR", { maximumFractionDigits: max });

export function BoxesClient({
  companyId,
  canManage,
  packRows,
  lotRows,
}: {
  companyId: string;
  canManage: boolean;
  packRows: PackRow[];
  lotRows: LotRow[];
}) {
  const router = useRouter();
  const [packs, setPacks] = useState<Record<string, number>>(
    () => Object.fromEntries(packRows.map((p) => [p.materialId, p.suggested])),
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(lotRows.filter((l) => l.clean).map((l) => l.lotId)),
  );
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [savingPack, startSavePack] = useTransition();
  const [converting, startConvert] = useTransition();

  const convertibleLots = useMemo(
    () => lotRows.filter((l) => l.convertible),
    [lotRows],
  );

  function savePacks() {
    setError(null);
    setNote(null);
    const entries = packRows.map((p) => ({
      materialId: p.materialId,
      pack: Math.max(1, Math.round(packs[p.materialId] ?? 1)),
    }));
    startSavePack(async () => {
      const res = await applyPackSizes(companyId, entries);
      if (!res.ok) setError(res.error);
      else {
        setNote(res.note ?? "Kaydedildi.");
        router.refresh();
      }
    });
  }

  function convert() {
    setError(null);
    setNote(null);
    const ids = [...selected];
    if (ids.length === 0) {
      setError("Çevrilecek lot seçilmedi.");
      return;
    }
    startConvert(async () => {
      const res = await convertLotsToBoxes(companyId, ids);
      if (!res.ok) setError(res.error);
      else {
        setNote(res.note ?? "Çevrildi.");
        router.refresh();
      }
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-8">
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {note ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {note}
        </p>
      ) : null}

      {/* 1. Paket boyu */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">1. Paket boyu (kutu içi adet)</h2>
            <p className="text-xs text-muted-foreground">
              Üründen otomatik okundu. Yanlışsa düzeltin; sıvılar 1&apos;dir.
            </p>
          </div>
          {canManage ? (
            <Button size="sm" disabled={savingPack} onClick={savePacks}>
              {savingPack ? "Kaydediliyor..." : "Paket boylarını kaydet"}
            </Button>
          ) : null}
        </div>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Ürün</th>
                <th className="px-3 py-2 text-left font-medium">Tür</th>
                <th className="px-3 py-2 text-right font-medium">Kutu içi adet</th>
              </tr>
            </thead>
            <tbody>
              {packRows.map((p) => (
                <tr key={p.materialId} className="border-t border-border">
                  <td className="px-3 py-2">{p.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {p.kind === "solid" ? "katı" : p.kind === "liquid" ? "sıvı" : "?"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={1}
                      value={packs[p.materialId] ?? 1}
                      disabled={!canManage}
                      onChange={(e) =>
                        setPacks((prev) => ({
                          ...prev,
                          [p.materialId]: Number(e.target.value),
                        }))
                      }
                      className="w-20 rounded-md border border-border bg-background px-2 py-1 text-right text-sm"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. Mevcut stok dönüşümü */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">2. Mevcut stoğu kutuya çevir</h2>
            <p className="text-xs text-muted-foreground">
              Tam bölünmeyenler <strong>zaten kutu olabilir</strong> — varsayılan seçili
              değil. Önce paket boylarını kaydedin.
            </p>
          </div>
          {canManage ? (
            <Button
              size="sm"
              disabled={converting || selected.size === 0}
              onClick={convert}
            >
              {converting ? "Çevriliyor..." : `Seçilenleri çevir (${selected.size})`}
            </Button>
          ) : null}
        </div>

        {convertibleLots.length === 0 ? (
          <p className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            Kutuya çevrilecek (katı, paket boyu &gt; 1) bitmiş lot yok.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Seç</th>
                  <th className="px-3 py-2 text-left font-medium">Ürün / Lot</th>
                  <th className="px-3 py-2 text-left font-medium">Depo</th>
                  <th className="px-3 py-2 text-right font-medium">Şu an</th>
                  <th className="px-3 py-2 text-right font-medium">Paket</th>
                  <th className="px-3 py-2 text-right font-medium">→ Kutu</th>
                </tr>
              </thead>
              <tbody>
                {convertibleLots.map((l) => (
                  <tr
                    key={l.lotId}
                    className={cn(
                      "border-t border-border",
                      !l.clean && "bg-amber-50/40 dark:bg-amber-950/10",
                    )}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(l.lotId)}
                        disabled={!canManage}
                        onChange={() => toggle(l.lotId)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div>{l.productName}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {l.lotNumber}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {l.location}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {nf(l.currentQty)} adet
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{l.pack}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="font-mono text-xs font-semibold text-emerald-600">
                        {nf(l.boxes)} kutu
                      </span>
                      {!l.clean ? (
                        <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                          tam bölünmüyor — zaten kutu olabilir
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
