"use client";

import { Gift, Plus } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/format";

import { addPromoStock, correctPromoLot, createPromoItem } from "./actions";

export type PromoLot = {
  id: string;
  lot_number: string;
  quantity_on_hand: number;
  notes: string | null;
  created_at: string;
  shelf: string | null;
};

export type ShelfOption = { id: string; code: string; name: string };

export type PromoItem = {
  id: string;
  code: string;
  name: string;
  barcode: string | null;
  total: number;
  lots: PromoLot[];
};

function fmt(n: number): string {
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 3 });
}

export function PromoClient({
  companyId,
  items,
  depotName,
  shelves,
  canWrite,
}: {
  companyId: string;
  items: PromoItem[];
  depotName: string | null;
  shelves: ShelfOption[];
  canWrite: boolean;
}) {
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const [showNew, setShowNew] = useState(false);
  const [openItem, setOpenItem] = useState<string | null>(null);
  const grandTotal = items.reduce((s, i) => s + i.total, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Promosyon Ürünleri</h1>
          <p className="text-sm text-muted-foreground">
            Satılmayan, depoda sayılan ürünler (numune, hediye, broşür vb.).
            {depotName ? ` Depo: ${depotName}.` : ""} Elle yapılan her düzeltme
            nedeniyle birlikte stok hareketlerine yazılır.
          </p>
        </div>
        {canWrite ? (
          <Button onClick={() => setShowNew((v) => !v)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            Yeni Promosyon Ürünü
          </Button>
        ) : null}
      </header>

      {message ? (
        <p
          className={`text-sm ${message.kind === "ok" ? "text-emerald-700" : "text-destructive"}`}
          role="status"
        >
          {message.text}
        </p>
      ) : null}

      {showNew && canWrite ? (
        <NewItemForm
          companyId={companyId}
          onDone={(m) => {
            setMessage(m);
            if (m.kind === "ok") setShowNew(false);
          }}
        />
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-md border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Promosyon Çeşidi</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{items.length}</p>
        </article>
        <article className="rounded-md border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Toplam Adet</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{fmt(grandTotal)}</p>
        </article>
      </section>

      {items.length === 0 ? (
        <EmptyState
          title="Henüz promosyon ürünü yok"
          description="Elinizdeki numune, hediye veya broşür gibi satılmayan ürünleri tanımlayıp adetlerini girin."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Kod</th>
                <th className="px-3 py-2 text-left font-medium">Ürün</th>
                <th className="px-3 py-2 text-left font-medium">Barkod</th>
                <th className="px-3 py-2 text-right font-medium">Eldeki Adet</th>
                <th className="px-3 py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const open = openItem === item.id;
                return (
                  <ItemRows
                    key={item.id}
                    companyId={companyId}
                    item={item}
                    shelves={shelves}
                    open={open}
                    canWrite={canWrite}
                    onToggle={() => setOpenItem(open ? null : item.id)}
                    onMessage={setMessage}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NewItemForm({
  companyId,
  onDone,
}: {
  companyId: string;
  onDone: (m: { kind: "ok" | "err"; text: string }) => void;
}) {
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [busy, start] = useTransition();
  return (
    <form
      className="grid gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createPromoItem(companyId, name, barcode);
          if (r.ok) {
            setName("");
            setBarcode("");
            onDone({ kind: "ok", text: "Promosyon ürünü eklendi." });
          } else onDone({ kind: "err", text: r.error });
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="promo-name">Ürün adı</Label>
        <Input
          id="promo-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Örn. Numune Omega-3 (10'lu)"
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="promo-barcode">Barkod (isteğe bağlı)</Label>
        <Input
          id="promo-barcode"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          placeholder="869..."
        />
      </div>
      <Button type="submit" disabled={busy || name.trim().length < 2}>
        Kaydet
      </Button>
    </form>
  );
}

function ItemRows({
  companyId,
  item,
  shelves,
  open,
  canWrite,
  onToggle,
  onMessage,
}: {
  companyId: string;
  item: PromoItem;
  shelves: ShelfOption[];
  open: boolean;
  canWrite: boolean;
  onToggle: () => void;
  onMessage: (m: { kind: "ok" | "err"; text: string }) => void;
}) {
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [shelfId, setShelfId] = useState("");
  const [busy, start] = useTransition();

  return (
    <>
      <tr className="border-t border-border">
        <td className="px-3 py-2 font-mono text-xs">{item.code}</td>
        <td className="px-3 py-2">
          <span className="inline-flex items-center gap-1.5">
            <Gift className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            {item.name}
          </span>
        </td>
        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
          {item.barcode ?? "—"}
        </td>
        <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt(item.total)}</td>
        <td className="px-3 py-2 text-right">
          <Button variant="outline" size="sm" onClick={onToggle}>
            {open ? "Kapat" : canWrite ? "Adet Gir / Düzelt" : "Detay"}
          </Button>
        </td>
      </tr>
      {open ? (
        <tr className="border-t border-border bg-secondary/20">
          <td colSpan={5} className="px-3 py-3">
            <div className="space-y-4">
              {canWrite ? (
                <form
                  className="grid gap-3 sm:grid-cols-[140px_180px_1fr_auto] sm:items-end"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = Number(qty.replace(",", "."));
                    start(async () => {
                      const r = await addPromoStock(companyId, item.id, n, note, shelfId || null);
                      if (r.ok) {
                        setQty("");
                        setNote("");
                        onMessage({
                          kind: "ok",
                          text: `${item.name}: ${fmt(n)} adet depoya işlendi.`,
                        });
                      } else onMessage({ kind: "err", text: r.error });
                    });
                  }}
                >
                  <div className="space-y-1">
                    <Label htmlFor={`qty-${item.id}`}>Eklenen adet</Label>
                    <Input
                      id={`qty-${item.id}`}
                      inputMode="decimal"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      placeholder="0"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`shelf-${item.id}`}>Raf</Label>
                    <select
                      id={`shelf-${item.id}`}
                      value={shelfId}
                      onChange={(e) => setShelfId(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    >
                      <option value="">Depo (rafsız)</option>
                      {shelves.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} — {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`note-${item.id}`}>Not (isteğe bağlı)</Label>
                    <Input
                      id={`note-${item.id}`}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Örn. fabrikadan gelen koli"
                    />
                  </div>
                  <Button type="submit" disabled={busy || !(Number(qty.replace(",", ".")) > 0)}>
                    Depoya Ekle
                  </Button>
                </form>
              ) : null}

              {item.lots.length > 0 ? (
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium">Giriş</th>
                      <th className="px-2 py-1 text-left font-medium">Parti</th>
                      <th className="px-2 py-1 text-left font-medium">Raf</th>
                      <th className="px-2 py-1 text-left font-medium">Not</th>
                      <th className="px-2 py-1 text-right font-medium">Adet</th>
                      {canWrite ? <th className="px-2 py-1 text-right font-medium">Düzelt</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {item.lots.map((lot) => (
                      <LotRow
                        key={lot.id}
                        companyId={companyId}
                        lot={lot}
                        canWrite={canWrite}
                        onMessage={onMessage}
                      />
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-muted-foreground">Bu ürün için henüz adet girilmedi.</p>
              )}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function LotRow({
  companyId,
  lot,
  canWrite,
  onMessage,
}: {
  companyId: string;
  lot: PromoLot;
  canWrite: boolean;
  onMessage: (m: { kind: "ok" | "err"; text: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(String(lot.quantity_on_hand));
  const [reason, setReason] = useState("");
  const [busy, start] = useTransition();
  const next = Number(qty.replace(",", "."));
  const changed = Number.isFinite(next) && next !== lot.quantity_on_hand;

  return (
    <tr className="border-t border-border/60">
      <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">
        {formatDateTime(lot.created_at)}
      </td>
      <td className="px-2 py-1 font-mono">{lot.lot_number}</td>
      <td className="px-2 py-1 font-mono">
        {lot.shelf ?? <span className="text-amber-700">rafsız</span>}
      </td>
      <td className="px-2 py-1">{lot.notes ?? "—"}</td>
      <td className="px-2 py-1 text-right font-mono tabular-nums">
        {fmt(lot.quantity_on_hand)}
      </td>
      {canWrite ? (
        <td className="px-2 py-1 text-right">
          {editing ? (
            <form
              className="flex flex-wrap items-center justify-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const r = await correctPromoLot(companyId, lot.id, next, reason);
                  if (r.ok) {
                    setEditing(false);
                    setReason("");
                    onMessage({
                      kind: "ok",
                      text: `Parti ${lot.lot_number}: ${fmt(lot.quantity_on_hand)} → ${fmt(next)} olarak düzeltildi.`,
                    });
                  } else onMessage({ kind: "err", text: r.error });
                });
              }}
            >
              <Input
                aria-label="Yeni adet"
                inputMode="decimal"
                className="h-8 w-24 text-right"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
              <Input
                aria-label="Düzeltme nedeni"
                className="h-8 w-48"
                placeholder="Neden (zorunlu)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                type="submit"
                size="sm"
                disabled={busy || !changed || !reason.trim()}
              >
                Onayla
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setQty(String(lot.quantity_on_hand));
                }}
              >
                Vazgeç
              </Button>
            </form>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Düzelt
            </Button>
          )}
        </td>
      ) : null}
    </tr>
  );
}
