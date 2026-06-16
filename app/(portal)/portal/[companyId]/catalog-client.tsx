"use client";

import { ImageOff, Minus, Plus, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { uomLabel } from "@/lib/uom";
import type { CatalogAvailability } from "@/types/database";
import { portalHomePath } from "@/types/roles";

import { placeOrder } from "./actions";

export type CatalogProduct = {
  materialId: string;
  code: string;
  name: string;
  baseUom: string;
  salePrice: number | null;
  imageUrl: string | null;
  availability: CatalogAvailability;
};

const money = (n: number) =>
  `${Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ₺`;

const AVAIL: Record<
  CatalogAvailability,
  { label: string; cls: string; orderable: boolean }
> = {
  in: {
    label: "Stokta var",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    orderable: true,
  },
  low: {
    label: "Az kaldı",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    orderable: true,
  },
  out: {
    label: "Tükendi",
    cls: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
    orderable: false,
  },
};

export function CatalogClient({
  companyId,
  products,
}: {
  companyId: string;
  products: CatalogProduct[];
}) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const byId = useMemo(
    () => new Map(products.map((p) => [p.materialId, p])),
    [products],
  );

  const cartIds = Object.keys(qty).filter((id) => (qty[id] ?? 0) > 0);
  const cartCount = cartIds.reduce((s, id) => s + (qty[id] ?? 0), 0);
  const cartTotal = cartIds.reduce((s, id) => {
    const p = byId.get(id);
    return s + (p?.salePrice ?? 0) * (qty[id] ?? 0);
  }, 0);

  function setQ(id: string, v: number) {
    setQty((prev) => ({ ...prev, [id]: Math.max(0, v) }));
  }

  function submit() {
    setMsg(null);
    const items = cartIds.map((id) => ({ material_id: id, quantity: qty[id] }));
    start(async () => {
      const res = await placeOrder(companyId, items, notes);
      if (!res.ok) {
        setMsg({ kind: "err", text: res.error });
        return;
      }
      setQty({});
      setNotes("");
      setMsg({ kind: "ok", text: `Siparişiniz alındı (${res.code}). Depo bilgilendirildi.` });
      router.push(`${portalHomePath(companyId)}/orders`);
    });
  }

  return (
    <div className="space-y-4">
      {msg ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            msg.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
              : "border-destructive/30 bg-destructive/5 text-destructive"
          }`}
        >
          {msg.text}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => {
          const a = AVAIL[p.availability];
          const q = qty[p.materialId] ?? 0;
          return (
            <div
              key={p.materialId}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-[0_2px_12px_-6px_rgba(0,0,0,0.12)]"
            >
              <div className="flex gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-secondary">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageOff className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug">{p.name}</p>
                  <span
                    className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${a.cls}`}
                  >
                    {a.label}
                  </span>
                </div>
              </div>

              <div className="mt-auto flex items-center justify-between gap-2">
                <span className="text-sm font-bold">
                  {p.salePrice !== null ? money(p.salePrice) : "Fiyat sorunuz"}
                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                    /{uomLabel(p.baseUom)}
                  </span>
                </span>

                {a.orderable ? (
                  q > 0 ? (
                    <div className="flex items-center gap-1.5">
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
                        className="h-7 w-14 rounded-md border border-border bg-background text-center text-sm"
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
                    <Button size="sm" variant="outline" onClick={() => setQ(p.materialId, 1)}>
                      <Plus className="mr-1 h-4 w-4" />
                      Ekle
                    </Button>
                  )
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {cartCount > 0 ? (
        <div className="sticky bottom-3 z-10 rounded-2xl border border-emerald-500/40 bg-card/95 p-3 shadow-lg backdrop-blur sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <ShoppingCart className="h-4 w-4 text-emerald-600" />
              <span className="font-semibold">{cartCount} adet</span>
              {cartTotal > 0 ? (
                <span className="text-muted-foreground">· {money(cartTotal)}</span>
              ) : null}
            </div>
            <Button disabled={pending} onClick={submit}>
              {pending ? "Gönderiliyor..." : "Sipariş Ver"}
            </Button>
          </div>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Sipariş notu (opsiyonel)"
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>
      ) : null}
    </div>
  );
}
