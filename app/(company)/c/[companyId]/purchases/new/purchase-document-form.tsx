"use client";

import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { companyModulePath } from "@/types/roles";

import { recordPurchaseDocument, type PurchaseDocumentState } from "../actions";

const initialState: PurchaseDocumentState = {};

type MaterialOption = {
  id: string;
  code: string;
  name: string;
  type: string;
  base_uom: string;
  default_supplier_id: string | null;
};
type SupplierOption = { id: string; code: string; name: string };
type LotOption = {
  id: string;
  lot_number: string;
  quantity_on_hand: number;
  materials: { code: string; name: string; base_uom: string } | null;
};

type Line = {
  key: number;
  mode: "new_lot" | "existing_lot";
  materialId: string;
  lotNumber: string;
  lotId: string;
  expiryDate: string;
  quantity: string;
  unitCost: string;
};

let keySeq = 1;
function emptyLine(): Line {
  return {
    key: keySeq++,
    mode: "new_lot",
    materialId: "",
    lotNumber: "",
    lotId: "",
    expiryDate: "",
    quantity: "",
    unitCost: "",
  };
}

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PurchaseDocumentForm({
  companyId,
  materials,
  suppliers,
  lots,
}: {
  companyId: string;
  materials: MaterialOption[];
  suppliers: SupplierOption[];
  lots: LotOption[];
}) {
  const [state, formAction] = useActionState(recordPurchaseDocument, initialState);
  const today = new Date().toISOString().slice(0, 10);
  const [receivedAt, setReceivedAt] = useState(today);
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const cancelHref = companyModulePath(companyId, "purchases");

  function update(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function remove(key: number) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  }

  const linesPayload = JSON.stringify(
    lines.map((l) => ({
      mode: l.mode,
      material_id: l.materialId,
      lot_id: l.lotId,
      lot_number: l.lotNumber,
      expiry_date: l.expiryDate,
      quantity: l.quantity,
      unit_cost: l.unitCost,
      received_at: receivedAt,
    })),
  );

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="lines" value={linesPayload} />

      {/* Belge başlığı — tek sefer */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Belge Bilgileri</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="received_at">Belge / Alış Tarihi</Label>
            <Input
              id="received_at"
              name="received_at"
              type="date"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supplier_id">Tedarikçi</Label>
            <select id="supplier_id" name="supplier_id" defaultValue="" className={selectClass}>
              <option value="">-- Seçilmedi --</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} - {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoice_number">Fatura No</Label>
            <Input id="invoice_number" name="invoice_number" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dispatch_note_number">İrsaliye No</Label>
            <Input id="dispatch_note_number" name="dispatch_note_number" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currency">Para Birimi</Label>
            <select id="currency" name="currency" defaultValue="" className={selectClass}>
              <option value="">Seçiniz</option>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Fatura/İrsaliye numarası ve tedarikçi bir kez girilir; aşağıdaki tüm
          kalemler aynı belgeye işlenir.
        </p>
      </section>

      {/* Kalemler — çok satır */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Kalemler ({lines.length})</h2>
          <Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
            <Plus className="mr-1 h-4 w-4" />
            Kalem Ekle
          </Button>
        </div>

        {lines.map((line, idx) => {
          const material = materials.find((m) => m.id === line.materialId);
          const lot = lots.find((l) => l.id === line.lotId);
          const uom = line.mode === "new_lot" ? material?.base_uom : lot?.materials?.base_uom;
          return (
            <div key={line.key} className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  Kalem {idx + 1}
                </span>
                {lines.length > 1 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => remove(line.key)}
                    aria-label="Kalemi sil"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Stok Hedefi</Label>
                  <select
                    value={line.mode}
                    onChange={(e) =>
                      update(line.key, {
                        mode: e.target.value as Line["mode"],
                        materialId: "",
                        lotId: "",
                        lotNumber: "",
                      })
                    }
                    className={selectClass}
                  >
                    <option value="new_lot">Yeni lot aç</option>
                    <option value="existing_lot">Mevcut lota ekle</option>
                  </select>
                </div>

                {line.mode === "new_lot" ? (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Malzeme *</Label>
                      <select
                        value={line.materialId}
                        onChange={(e) => update(line.key, { materialId: e.target.value })}
                        className={selectClass}
                      >
                        <option value="">-- Seçiniz --</option>
                        {materials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.code} - {m.name} ({m.base_uom})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Lot Numarası *</Label>
                      <Input
                        value={line.lotNumber}
                        onChange={(e) => update(line.key, { lotNumber: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Son Kullanma (SKT)</Label>
                      <Input
                        type="date"
                        value={line.expiryDate}
                        onChange={(e) => update(line.key, { expiryDate: e.target.value })}
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Mevcut Lot *</Label>
                    <select
                      value={line.lotId}
                      onChange={(e) => update(line.key, { lotId: e.target.value })}
                      className={selectClass}
                    >
                      <option value="">-- Seçiniz --</option>
                      {lots.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.lot_number} - {l.materials?.code} {l.materials?.name} (
                          {Number(l.quantity_on_hand)} {l.materials?.base_uom})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Miktar *{" "}
                    {uom ? <span className="text-muted-foreground">({uom})</span> : null}
                  </Label>
                  <Input
                    type="number"
                    step="0.000001"
                    min="0"
                    value={line.quantity}
                    onChange={(e) => update(line.key, { quantity: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Birim Maliyet</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={line.unitCost}
                    onChange={(e) => update(line.key, { unitCost: e.target.value })}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notlar</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <SubmitButton>Belgeyi Kaydet ({lines.length} kalem)</SubmitButton>
        <Link href={cancelHref}>
          <Button type="button" variant="outline">
            İptal
          </Button>
        </Link>
      </div>
    </form>
  );
}
