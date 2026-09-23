"use client";

import Link from "next/link";
import { useActionState, useMemo } from "react";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { companyModulePath } from "@/types/roles";

import { updateLot, type LotEditState } from "../../actions";

const initialState: LotEditState = {};

interface SupplierOption {
  id: string;
  code: string;
  name: string;
}

export interface LotEditInitial {
  id: string;
  lot_number: string;
  supplier_id: string | null;
  received_at: string | null;
  expiry_date: string | null;
  quantity_on_hand: number;
  unit_cost: number | null;
  currency: string | null;
  notes: string | null;
  customerOwned: boolean;
  base_uom: string;
}

interface LotEditFormProps {
  companyId: string;
  suppliers: SupplierOption[];
  initial: LotEditInitial;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function LotEditForm({ companyId, suppliers, initial }: LotEditFormProps) {
  const [state, formAction] = useActionState(updateLot, initialState);
  const cancelHref = companyModulePath(companyId, "lots", initial.id);

  const supplierOptions = useMemo(
    () => suppliers.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })),
    [suppliers],
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="lot_id" value={initial.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="lot_number">Lot Numarası *</Label>
          <Input
            id="lot_number"
            name="lot_number"
            required
            defaultValue={initial.lot_number}
          />
          <FieldError message={state.fieldErrors?.lot_number} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="supplier_id">Tedarikçi</Label>
          <SearchableSelect
            id="supplier_id"
            name="supplier_id"
            defaultValue={initial.supplier_id ?? ""}
            options={supplierOptions}
            emptyLabel="— Seçilmedi —"
            placeholder="— Seçilmedi —"
          />
          <FieldError message={state.fieldErrors?.supplier_id} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="received_at">Alış Tarihi</Label>
          <Input
            id="received_at"
            name="received_at"
            type="date"
            defaultValue={initial.received_at ?? ""}
          />
          <FieldError message={state.fieldErrors?.received_at} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="expiry_date">Son Kullanma</Label>
          <Input
            id="expiry_date"
            name="expiry_date"
            type="date"
            defaultValue={initial.expiry_date ?? ""}
          />
          <FieldError message={state.fieldErrors?.expiry_date} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="quantity_on_hand">
            Eldeki Miktar *{" "}
            <span className="text-muted-foreground">({initial.base_uom})</span>
          </Label>
          <Input
            id="quantity_on_hand"
            name="quantity_on_hand"
            type="number"
            step="0.000001"
            min="0"
            required
            defaultValue={String(initial.quantity_on_hand)}
          />
          <FieldError message={state.fieldErrors?.quantity_on_hand} />
          <p className="text-xs text-muted-foreground">
            Değiştirirseniz fark kadar düzeltme hareketi yazılır; defter
            silinmez.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="unit_cost">Birim Maliyet</Label>
          <Input
            id="unit_cost"
            name="unit_cost"
            type="number"
            step="0.0001"
            min="0"
            defaultValue={initial.unit_cost !== null ? String(initial.unit_cost) : ""}
            placeholder={initial.customerOwned ? "Müşteri malı — girilmez" : "örn. 12.5000"}
            disabled={initial.customerOwned}
          />
          <FieldError message={state.fieldErrors?.unit_cost} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="currency">Para Birimi (ISO 4217)</Label>
          <select
            id="currency"
            name="currency"
            defaultValue={initial.currency ?? ""}
            disabled={initial.customerOwned}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
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
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={initial.notes ?? ""}
        />
        <FieldError message={state.fieldErrors?.notes} />
      </div>

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <SubmitButton>Değişiklikleri Kaydet</SubmitButton>
        <Link href={cancelHref}>
          <Button type="button" variant="outline">
            İptal
          </Button>
        </Link>
      </div>
    </form>
  );
}
