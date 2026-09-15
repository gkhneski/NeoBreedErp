"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { Label } from "@/components/ui/label";
import {
  SearchableSelect,
  type SearchableOption,
} from "@/components/ui/searchable-select";
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
  const options: SearchableOption[] = [
    ...groups.flatMap((group) => {
      const groupLabel = `${group.depot.code} — ${group.depot.name}`;
      return [
        { value: group.depot.id, label: groupLabel, group: groupLabel },
        ...group.shelves.map((shelf) => ({
          value: shelf.id,
          label: `${shelf.code} — ${shelf.name}`,
          group: groupLabel,
        })),
      ];
    }),
    ...targets
      .filter(
        (t) =>
          t.kind === "shelf" &&
          !groups.some((g) => g.depot.id === t.parent_id),
      )
      .map((shelf) => ({
        value: shelf.id,
        label: `${shelf.code} — ${shelf.name}`,
      })),
  ];

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
        <SearchableSelect
          id="to_location_id"
          name="to_location_id"
          required
          defaultValue={targets.length === 1 ? targets[0].id : ""}
          options={options}
          placeholder="— Seçiniz —"
          className="max-w-sm"
        />
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
