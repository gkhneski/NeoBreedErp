"use client";

import { Plus } from "lucide-react";
import { useActionState, useMemo, useState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";

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
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="shipment_id" value={shipmentId} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1 space-y-1.5">
          <Label htmlFor="lot_id">Lot ekle</Label>
          <SearchableSelect
            id="lot_id"
            name="lot_id"
            required
            value={lotId}
            onChange={(v) => setLotId(v)}
            options={lots.map((l) => ({
              value: l.id,
              label: `${l.material_name} · ${l.lot_number}`,
              keywords: `${l.material_code} ${l.location_name ?? ""}`,
            }))}
            placeholder="Ara: ürün, lot, barkod…"
            className="[&_input]:h-10 [&_input]:rounded-lg"
          />
        </div>

        <div className="w-36 space-y-1.5">
          <Label htmlFor="quantity">
            Miktar{selected ? ` (${selected.base_uom})` : ""}
          </Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            step="0.000001"
            min="0"
            max={selected?.quantity_on_hand}
            required
            placeholder="adet"
            className="h-10 rounded-lg"
          />
        </div>

        <SubmitButton
          pendingLabel="Ekleniyor..."
          className="h-10 rounded-lg bg-green-700 text-white hover:bg-green-800"
        >
          <Plus className="h-4 w-4" />
          Kalem Ekle
        </SubmitButton>
      </div>

      {selected ? (
        <p className="text-xs text-muted-foreground">
          Eldeki stok:{" "}
          <span className="font-mono font-medium text-foreground">
            {selected.quantity_on_hand.toLocaleString("tr-TR")} {selected.base_uom}
          </span>
          {selected.location_name ? ` · ${selected.location_name}` : ""}
          {" · "}
          <span className="font-mono">{selected.material_code}</span>
        </p>
      ) : null}

      {state.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
