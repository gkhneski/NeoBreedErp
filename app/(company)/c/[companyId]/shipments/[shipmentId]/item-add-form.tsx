"use client";

import { useActionState, useMemo, useState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { addShipmentItem, type ShipmentItemFormState } from "../actions";

const initialState: ShipmentItemFormState = {};

interface LotOption {
  id: string;
  lot_number: string;
  quantity_on_hand: number;
  material_code: string;
  material_name: string;
  base_uom: string;
  location_name: string | null;
}

export function ShipmentItemAddForm({
  companyId,
  shipmentId,
  lots,
}: {
  companyId: string;
  shipmentId: string;
  lots: LotOption[];
}) {
  const [state, formAction] = useActionState(addShipmentItem, initialState);
  const [lotId, setLotId] = useState("");

  const selected = useMemo(
    () => lots.find((l) => l.id === lotId) ?? null,
    [lots, lotId],
  );

  if (lots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sevk edilebilir (Serbest durumda, stoğu olan) lot yok.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="shipment_id" value={shipmentId} />

      <div className="min-w-64 flex-1 space-y-1.5">
        <Label htmlFor="lot_id">Lot</Label>
        <select
          id="lot_id"
          name="lot_id"
          required
          value={lotId}
          onChange={(e) => setLotId(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="" disabled>
            — Seçiniz —
          </option>
          {lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.lot_number} · {l.material_code} {l.material_name} (eldeki{" "}
              {l.quantity_on_hand.toLocaleString("tr-TR")} {l.base_uom}
              {l.location_name ? ` · ${l.location_name}` : ""})
            </option>
          ))}
        </select>
      </div>

      <div className="w-40 space-y-1.5">
        <Label htmlFor="quantity">
          Miktar{selected ? ` (${selected.base_uom})` : ""}
        </Label>
        <Input
          id="quantity"
          name="quantity"
          type="number"
          step="0.000001"
          min="0"
          required
          placeholder="adet/miktar"
        />
      </div>

      <SubmitButton size="sm" pendingLabel="Ekleniyor...">
        Kalem Ekle
      </SubmitButton>

      {state.error ? (
        <p className="w-full rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
