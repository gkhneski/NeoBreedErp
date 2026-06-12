"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { Label } from "@/components/ui/label";

import { transferLot, type TransferLotState } from "../actions";

const initialState: TransferLotState = {};

interface LocationOption {
  id: string;
  code: string;
  name: string;
}

export function TransferForm({
  companyId,
  lotId,
  currentLocationId,
  locations,
  lotReleased,
}: {
  companyId: string;
  lotId: string;
  currentLocationId: string | null;
  locations: LocationOption[];
  lotReleased: boolean;
}) {
  const [state, formAction] = useActionState(transferLot, initialState);
  const targets = locations.filter((l) => l.id !== currentLocationId);

  if (targets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Transfer için başka depo yok. Ayarlar → Depolar&apos;dan yeni depo
        ekleyin.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="lot_id" value={lotId} />

      <div className="space-y-1.5">
        <Label htmlFor="to_location_id">Hedef Depo</Label>
        <select
          id="to_location_id"
          name="to_location_id"
          required
          defaultValue={targets.length === 1 ? targets[0].id : ""}
          className="flex h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {targets.length > 1 ? (
            <option value="" disabled>
              — Seçiniz —
            </option>
          ) : null}
          {targets.map((l) => (
            <option key={l.id} value={l.id}>
              {l.code} — {l.name}
            </option>
          ))}
        </select>
      </div>

      {!lotReleased ? (
        <p className="text-xs text-muted-foreground">
          Bu lot &quot;Serbest&quot; durumda olmadığı için transfer
          reddedilecektir; önce QC ile serbest bırakın.
        </p>
      ) : null}

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}

      <SubmitButton pendingLabel="Transfer ediliyor...">
        Transfer Et
      </SubmitButton>
    </form>
  );
}
