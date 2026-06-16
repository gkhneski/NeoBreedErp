"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { uomLabel } from "@/lib/uom";

import { saveCatalogEntry } from "./actions";

export type CatalogManagerRow = {
  materialId: string;
  code: string;
  name: string;
  baseUom: string;
  isListed: boolean;
  salePrice: number | null;
  lowStockThreshold: number;
};

function Row({
  companyId,
  row,
  canWrite,
}: {
  companyId: string;
  row: CatalogManagerRow;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [isListed, setIsListed] = useState(row.isListed);
  const [price, setPrice] = useState(row.salePrice !== null ? String(row.salePrice) : "");
  const [threshold, setThreshold] = useState(String(row.lowStockThreshold));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    setSaved(false);
    const parsedPrice = price.trim() ? Number(price.replace(",", ".")) : null;
    const parsedThreshold = Number(threshold) || 0;
    start(async () => {
      const res = await saveCatalogEntry(
        companyId,
        row.materialId,
        isListed,
        parsedPrice,
        parsedThreshold,
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      router.refresh();
    });
  }

  return (
    <tr className="border-t border-border align-middle">
      <td className="px-3 py-2">
        <span className="font-mono text-xs text-muted-foreground">{row.code}</span>{" "}
        {row.name}
      </td>
      <td className="px-3 py-2 text-center">
        <input
          type="checkbox"
          checked={isListed}
          disabled={!canWrite}
          onChange={(e) => setIsListed(e.target.checked)}
          className="h-4 w-4 accent-emerald-600"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <input
          type="text"
          inputMode="decimal"
          value={price}
          disabled={!canWrite}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0,00"
          className="h-8 w-24 rounded-md border border-border bg-background px-2 text-right text-sm"
        />
        <span className="ml-1 text-[11px] text-muted-foreground">
          ₺/{uomLabel(row.baseUom)}
        </span>
      </td>
      <td className="px-3 py-2 text-right">
        <input
          type="number"
          min={0}
          value={threshold}
          disabled={!canWrite}
          onChange={(e) => setThreshold(e.target.value)}
          className="h-8 w-20 rounded-md border border-border bg-background px-2 text-right text-sm"
        />
      </td>
      {canWrite ? (
        <td className="px-3 py-2 text-right">
          <Button size="sm" variant="outline" disabled={pending} onClick={save}>
            {saved ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : pending ? (
              "..."
            ) : (
              "Kaydet"
            )}
          </Button>
          {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
        </td>
      ) : null}
    </tr>
  );
}

export function CatalogManager({
  companyId,
  rows,
  canWrite,
}: {
  companyId: string;
  rows: CatalogManagerRow[];
  canWrite: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Ürün</th>
            <th className="px-3 py-2 text-center font-medium">Portalda</th>
            <th className="px-3 py-2 text-right font-medium">B2B Fiyat</th>
            <th className="px-3 py-2 text-right font-medium">Düşük stok eşiği</th>
            {canWrite ? <th className="px-3 py-2" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row
              key={row.materialId}
              companyId={companyId}
              row={row}
              canWrite={canWrite}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
