"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { Label } from "@/components/ui/label";
import { groupLocations, type LocationOption } from "@/lib/locations";

import { transferLot, type TransferLotState } from "../actions";

const initialState: TransferLotState = {};

export function TransferForm({
  companyId,
  lotId,
  currentLocationId,
  locations,
  lotBlocked,
}: {
  companyId: string;
  lotId: string;
  currentLocationId: string | null;
  locations: LocationOption[];
  lotBlocked: boolean;
}) {
  const [state, formAction] = useActionState(transferLot, initialState);
  const targets = locations.filter((l) => l.id !== currentLocationId);
  const groups = groupLocations(targets);

  if (targets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Transfer için başka konum yok. Ayarlar → Depolar ve Raflar&apos;dan
        yeni depo veya raf ekleyin.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="lot_id" value={lotId} />

      <div className="space-y-1.5">
        <Label htmlFor="to_location_id">Hedef Konum (Depo / Raf)</Label>
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
          {groups.map((group) => (
            <optgroup
              key={group.depot.id}
              label={`${group.depot.code} — ${group.depot.name}`}
            >
              <option value={group.depot.id}>
                {group.depot.code} — {group.depot.name}
              </option>
              {group.shelves.map((shelf) => (
                <option key={shelf.id} value={shelf.id}>
                  {shelf.code} — {shelf.name}
                </option>
              ))}
            </optgroup>
          ))}
          {targets
            .filter(
              (t) =>
                t.kind === "shelf" &&
                !groups.some((g) => g.depot.id === t.parent_id),
            )
            .map((shelf) => (
              <option key={shelf.id} value={shelf.id}>
                {shelf.code} — {shelf.name}
              </option>
            ))}
        </select>
      </div>

      {lotBlocked ? (
        <p className="text-xs text-muted-foreground">
          Bu lot &quot;Bloklu&quot; durumda olduğu için transfer
          reddedilecektir.
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
