"use client";

import { Minus, Plus, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { uomLabel } from "@/lib/uom";
import type { CatalogAvailability } from "@/types/database";
import { companyModulePath } from "@/types/roles";

import { placeRepOrder } from "../actions";

export type RepCatalogProduct = {
  materialId: string;
  name: string;
  baseUom: string;
  salePrice: number | null;
  availability: CatalogAvailability;
};

const money = (n: number) =>
  `${Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ₺`;

const AVAIL: Record<CatalogAvailability, { label: string; cls: string; orderable: boolean }> = {
  in: { label: "Stokta var", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", orderable: true },
  low: { label: "Az kaldı", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400", orderable: true },
  out: { label: "Tükendi", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-400", orderable: false },
};

export function RepOrderForm({
  companyId,
  customers,
  products,
}: {
  companyId: string;
  customers: Array<{ id: string; label: string }>;
  products: RepCatalogProduct[];
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(
    () => new Map(products.map((p) => [p.materialId, p])),
    [products],
  );
  const cartIds = Object.keys(qty).filter((id) => (qty[id] ?? 0) > 0);
  const cartCount = cartIds.reduce((s, id) => s + (qty[id] ?? 0), 0);
  const cartTotal = cartIds.reduce(
    (s, id) => s + (byId.get(id)?.salePrice ?? 0) * (qty[id] ?? 0),
    0,
  );

  function setQ(id: string, v: number) {
    setQty((prev) => ({ ...prev, [id]: Math.max(0, v) }));
  }

  function submit() {
    setError(null);
    if (!customerId) {
      setError("Önce bir müşteri seçin.");
      return;
    }
    const items = cartIds.map((id) => ({ material_id: id, quantity: qty[id] }));
    start(async () => {
      const res = await placeRepOrder(companyId, customerId, items, notes);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(companyModulePath(companyId, "sales-orders"));
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <label className="text-xs font-medium text-muted-foreground">
          Müşteri (eczane/depo)
        </label>
        <select
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="mt-1 h-9 w-full max-w-md rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="" disabled>
            Seçin…
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Ürün</th>
              <th className="px-3 py-2 text-left font-medium">Durum</th>
              <th className="px-3 py-2 text-right font-medium">Fiyat</th>
              <th className="px-3 py-2 text-right font-medium">Adet</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const a = AVAIL[p.availability];
              const q = qty[p.materialId] ?? 0;
              return (
                <tr key={p.materialId} className="border-t border-border align-middle">
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${a.cls}`}>
                      {a.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.salePrice !== null ? money(p.salePrice) : "—"}
                    <span className="ml-1 text-[11px] text-muted-foreground">
                      /{uomLabel(p.baseUom)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {a.orderable ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setQ(p.materialId, q - 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-border hover:bg-secondary"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={q}
                          onChange={(e) => setQ(p.materialId, Number(e.target.value))}
                          className="h-7 w-16 rounded-md border border-border bg-background text-center text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setQ(p.materialId, q + 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-border hover:bg-secondary"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="block text-right text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Sipariş notu (opsiyonel)"
        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-card/95 p-3 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2 text-sm">
          <ShoppingCart className="h-4 w-4 text-emerald-600" />
          <span className="font-semibold">{cartCount} adet</span>
          {cartTotal > 0 ? (
            <span className="text-muted-foreground">· {money(cartTotal)}</span>
          ) : null}
        </div>
        <Button disabled={pending || cartCount === 0} onClick={submit}>
          {pending ? "Gönderiliyor..." : "Siparişi Oluştur"}
        </Button>
      </div>
    </div>
  );
}
