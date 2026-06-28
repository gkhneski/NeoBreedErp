"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { companyModulePath } from "@/types/roles";

import { placeManualOrder } from "../actions";

export type ManualProduct = {
  materialId: string;
  label: string;
  baseUom: string;
};

export function ManualOrderForm({
  companyId,
  customers,
  products,
}: {
  companyId: string;
  customers: Array<{ id: string; label: string }>;
  products: ManualProduct[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [customerId, setCustomerId] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function submit() {
    setMsg(null);
    if (!customerId) {
      setMsg({ kind: "err", text: "Müşteri seçin." });
      return;
    }
    const items = products
      .map((p) => ({
        material_id: p.materialId,
        quantity: Number((qty[p.materialId] ?? "").replace(",", ".")),
      }))
      .filter((i) => Number.isFinite(i.quantity) && i.quantity > 0);
    if (items.length === 0) {
      setMsg({ kind: "err", text: "En az bir ürüne miktar girin." });
      return;
    }
    start(async () => {
      const res = await placeManualOrder(companyId, customerId, items, notes);
      if (!res.ok) {
        setMsg({ kind: "err", text: res.error });
        return;
      }
      router.push(companyModulePath(companyId, "mrp"));
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="customer">Müşteri *</Label>
          <select
            id="customer"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">-- Seçiniz --</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ürünler — sipariş edilen miktarı girin
        </div>
        <div className="divide-y divide-border">
          {products.map((p) => (
            <div key={p.materialId} className="flex items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">{p.label}</span>
              <Input
                type="text"
                inputMode="decimal"
                value={qty[p.materialId] ?? ""}
                onChange={(e) =>
                  setQty((q) => ({ ...q, [p.materialId]: e.target.value }))
                }
                placeholder="0"
                className="w-28 text-right"
              />
              <span className="w-10 text-xs text-muted-foreground">{p.baseUom}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notlar</Label>
        <Textarea
          id="notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {msg ? (
        <p
          className={`text-sm ${
            msg.kind === "ok" ? "text-emerald-600" : "text-destructive"
          }`}
        >
          {msg.text}
        </p>
      ) : null}

      <Button disabled={pending} onClick={submit}>
        {pending ? "Kaydediliyor..." : "Siparişi Oluştur ve MRP'ye Git"}
      </Button>
    </div>
  );
}
