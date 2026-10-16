"use client";

import { Pencil, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatDateTime } from "@/lib/format";
import { uomLabel } from "@/lib/uom";

import { correctDepotLot, voidDepotLot } from "../actions";

export type FixLot = {
  id: string;
  lotNumber: string;
  quantity: number;
  status: "quarantine" | "released" | "blocked";
  expiryDate: string | null;
  location: string | null;
  createdAt: string;
  productCode: string;
  productName: string;
  barcode: string | null;
  uom: string;
  promo: boolean;
};

const STATUS_LABEL: Record<FixLot["status"], string> = {
  quarantine: "Karantina",
  released: "Serbest",
  blocked: "Bloklu",
};

const VISIBLE_LIMIT = 50;

function norm(s: string): string {
  return s.toLocaleLowerCase("tr-TR");
}

export function DepotLotFixClient({
  companyId,
  lots,
}: {
  companyId: string;
  lots: FixLot[];
}) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return lots;
    return lots.filter(
      (l) =>
        norm(l.productName).includes(q) ||
        norm(l.productCode).includes(q) ||
        norm(l.lotNumber).includes(q) ||
        (l.barcode ?? "").includes(q),
    );
  }, [lots, query]);

  const visible = filtered.slice(0, VISIBLE_LIMIT);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ürün adı, barkod veya lot no ara"
          className="h-11 pl-9 text-base"
        />
      </div>

      {notice ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {filtered.length.toLocaleString("tr-TR")} lot
        {filtered.length > VISIBLE_LIMIT
          ? ` · ilk ${VISIBLE_LIMIT} gösteriliyor, aramayı daraltın`
          : ""}
        {" · "}en son girilen en üstte
      </p>

      <ul className="space-y-2">
        {visible.map((lot) => (
          <li key={lot.id} className="rounded-md border border-border bg-card">
            <div className="flex flex-wrap items-start justify-between gap-3 p-3">
              <div className="min-w-0 space-y-1">
                <p className="font-medium">
                  {lot.productName}
                  {lot.promo ? (
                    <Badge variant="secondary" className="ml-2">
                      Promosyon
                    </Badge>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  Lot <span className="font-mono">{lot.lotNumber}</span>
                  {" · "}SKT {lot.expiryDate ? formatDate(lot.expiryDate) : "—"}
                  {" · "}
                  {lot.location ?? "—"}
                  {" · "}
                  {STATUS_LABEL[lot.status]}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Giriş: {formatDateTime(lot.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-right font-mono text-lg font-semibold tabular-nums">
                  {lot.quantity.toLocaleString("tr-TR", { maximumFractionDigits: 3 })}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {uomLabel(lot.uom)}
                  </span>
                </p>
                {openId !== lot.id ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setNotice(null);
                      setOpenId(lot.id);
                    }}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Düzelt
                  </Button>
                ) : null}
              </div>
            </div>
            {openId === lot.id ? (
              <LotFixForm
                companyId={companyId}
                lot={lot}
                onClose={() => setOpenId(null)}
                onDone={(msg) => {
                  setOpenId(null);
                  setNotice(msg);
                }}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LotFixForm({
  companyId,
  lot,
  onClose,
  onDone,
}: {
  companyId: string;
  lot: FixLot;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(String(lot.quantity));
  const [lotNumber, setLotNumber] = useState(lot.lotNumber);
  const [expiryDate, setExpiryDate] = useState(lot.expiryDate ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const qty = Number(quantity.replace(",", "."));
    if (!Number.isFinite(qty) || qty < 0) {
      setError("Geçerli bir adet giriniz (0 veya üzeri).");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await correctDepotLot({
        companyId,
        lotId: lot.id,
        quantity: qty,
        lotNumber,
        expiryDate: expiryDate || null,
        reason,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone(`${lot.productName} — lot ${lotNumber} düzeltildi.`);
      router.refresh();
    });
  }

  function remove() {
    if (
      !window.confirm(
        `Bu giriş silinsin mi?\n\n${lot.productName}\nLot ${lot.lotNumber} · ${lot.quantity} ${uomLabel(lot.uom)}\n\nStoktan düşülür ve protokole yazılır.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await voidDepotLot({ companyId, lotId: lot.id, reason });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone(`${lot.productName} — lot ${lot.lotNumber} silindi.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 border-t border-border bg-secondary/30 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={`qty-${lot.id}`}>Doğru adet ({uomLabel(lot.uom)})</Label>
          <Input
            id={`qty-${lot.id}`}
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={quantity}
            disabled={pending}
            onChange={(e) => setQuantity(e.target.value)}
            className="h-11 text-base"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`lot-${lot.id}`}>Lot no</Label>
          <Input
            id={`lot-${lot.id}`}
            value={lotNumber}
            disabled={pending}
            onChange={(e) => setLotNumber(e.target.value)}
            className="h-11 font-mono text-base"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`skt-${lot.id}`}>SKT</Label>
          <Input
            id={`skt-${lot.id}`}
            type="date"
            value={expiryDate}
            disabled={pending}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="h-11 text-base"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`reason-${lot.id}`}>Neden (zorunlu)</Label>
        <Textarea
          id={`reason-${lot.id}`}
          value={reason}
          disabled={pending}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Örn. 48 yerine 84 yazılmış; kolide 48 kutu var."
          rows={2}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={remove}
          disabled={pending}
          className="text-destructive hover:text-destructive"
          title="Yanlış ürünle açılmış girişi tamamen sil"
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Yanlış giriş — sil
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Vazgeç
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </div>
      </div>
    </div>
  );
}
