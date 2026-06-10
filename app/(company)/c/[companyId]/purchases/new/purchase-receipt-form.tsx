"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { companyModulePath } from "@/types/roles";

import {
  recordPurchaseReceipt,
  type PurchaseReceiptFormState,
} from "../actions";

const initialState: PurchaseReceiptFormState = {};

type MaterialOption = {
  id: string;
  code: string;
  name: string;
  type: string;
  base_uom: string;
  default_supplier_id: string | null;
};

type SupplierOption = {
  id: string;
  code: string;
  name: string;
};

type LotOption = {
  id: string;
  lot_number: string;
  quantity_on_hand: number;
  materials: {
    code: string;
    name: string;
    base_uom: string;
  } | null;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function PurchaseReceiptForm({
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
  const [state, formAction] = useActionState(
    recordPurchaseReceipt,
    initialState,
  );
  const [mode, setMode] = useState<"new_lot" | "existing_lot">("new_lot");
  const [materialId, setMaterialId] = useState("");
  const [lotId, setLotId] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const cancelHref = companyModulePath(companyId, "purchases");

  const selectedMaterial = useMemo(
    () => materials.find((m) => m.id === materialId),
    [materials, materialId],
  );
  const selectedLot = useMemo(
    () => lots.find((l) => l.id === lotId),
    [lots, lotId],
  );
  const uom =
    mode === "new_lot"
      ? selectedMaterial?.base_uom
      : selectedLot?.materials?.base_uom;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="company_id" value={companyId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="receipt_mode">Stok Hedefi *</Label>
          <select
            id="receipt_mode"
            name="receipt_mode"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as "new_lot" | "existing_lot");
              setMaterialId("");
              setLotId("");
            }}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="new_lot">Yeni lot aç</option>
            <option value="existing_lot">Mevcut lota ekle</option>
          </select>
          <FieldError message={state.fieldErrors?.receipt_mode} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="received_at">Belge / Alış Tarihi</Label>
          <Input
            id="received_at"
            name="received_at"
            type="date"
            defaultValue={today}
          />
          <FieldError message={state.fieldErrors?.received_at} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="invoice_number">Fatura No</Label>
          <Input id="invoice_number" name="invoice_number" />
          <FieldError message={state.fieldErrors?.invoice_number} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dispatch_note_number">İrsaliye No</Label>
          <Input id="dispatch_note_number" name="dispatch_note_number" />
          <FieldError message={state.fieldErrors?.dispatch_note_number} />
        </div>

        {mode === "new_lot" ? (
          <>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="material_id">Malzeme *</Label>
              <select
                id="material_id"
                name="material_id"
                required
                value={materialId}
                onChange={(e) => setMaterialId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="" disabled>
                  -- Seçiniz --
                </option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} - {m.name} ({m.base_uom})
                  </option>
                ))}
              </select>
              <FieldError message={state.fieldErrors?.material_id} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lot_number">Lot Numarası *</Label>
              <Input id="lot_number" name="lot_number" required />
              <FieldError message={state.fieldErrors?.lot_number} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="supplier_id">Tedarikçi</Label>
              <select
                id="supplier_id"
                name="supplier_id"
                defaultValue={selectedMaterial?.default_supplier_id ?? ""}
                key={`supplier-${materialId}`}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">-- Seçilmedi --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
              <FieldError message={state.fieldErrors?.supplier_id} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expiry_date">Son Kullanma</Label>
              <Input id="expiry_date" name="expiry_date" type="date" />
              <FieldError message={state.fieldErrors?.expiry_date} />
            </div>
          </>
        ) : (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="lot_id">Mevcut Lot *</Label>
            <select
              id="lot_id"
              name="lot_id"
              required
              value={lotId}
              onChange={(e) => setLotId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="" disabled>
                -- Seçiniz --
              </option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lot_number} - {l.materials?.code} {l.materials?.name} (
                  {Number(l.quantity_on_hand)} {l.materials?.base_uom})
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors?.lot_id} />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="quantity">
            Miktar *{" "}
            {uom ? <span className="text-muted-foreground">({uom})</span> : null}
          </Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            step="0.000001"
            min="0"
            required
          />
          <FieldError message={state.fieldErrors?.quantity} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="unit_cost">Birim Maliyet</Label>
          <Input
            id="unit_cost"
            name="unit_cost"
            type="number"
            step="0.0001"
            min="0"
          />
          <FieldError message={state.fieldErrors?.unit_cost} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="currency">Para Birimi</Label>
          <select
            id="currency"
            name="currency"
            defaultValue=""
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Seçiniz</option>
            {SUPPORTED_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
          <FieldError message={state.fieldErrors?.currency} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notlar</Label>
        <Textarea id="notes" name="notes" rows={3} />
        <FieldError message={state.fieldErrors?.notes} />
      </div>

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <SubmitButton>Stoğa Al</SubmitButton>
        <Link href={cancelHref}>
          <Button type="button" variant="outline">
            İptal
          </Button>
        </Link>
      </div>
    </form>
  );
}
