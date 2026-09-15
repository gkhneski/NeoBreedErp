"use client";

import { useActionState, useState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";

import {
  createLocation,
  updateLocation,
  type LocationFormState,
} from "./actions";

const initialState: LocationFormState = {};

type LocationInitial = {
  id: string;
  code: string;
  name: string;
  kind: "depot" | "shelf";
  parent_id: string | null;
  notes: string | null;
};

type DepotOption = {
  id: string;
  code: string;
  name: string;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function LocationForm({
  companyId,
  depots,
  initial,
}: {
  companyId: string;
  depots: DepotOption[];
  initial?: LocationInitial;
}) {
  const [state, formAction] = useActionState(
    initial ? updateLocation : createLocation,
    initialState,
  );
  const [kind, setKind] = useState<"depot" | "shelf">(initial?.kind ?? "depot");

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="company_id" value={companyId} />
      {initial ? (
        <input type="hidden" name="location_id" value={initial.id} />
      ) : null}

      <div className="space-y-1.5">
        <Label>Tür *</Label>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="kind"
              value="depot"
              checked={kind === "depot"}
              onChange={() => setKind("depot")}
            />
            Depo
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="kind"
              value="shelf"
              checked={kind === "shelf"}
              onChange={() => setKind("shelf")}
              disabled={depots.length === 0}
            />
            Raf
          </label>
        </div>
        {depots.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Raf eklemek için önce bir depo oluşturun.
          </p>
        ) : null}
      </div>

      {kind === "shelf" ? (
        <div className="space-y-1.5">
          <Label htmlFor="parent_id">Bağlı Olduğu Depo *</Label>
          <SearchableSelect
            id="parent_id"
            name="parent_id"
            required
            defaultValue={initial?.parent_id ?? ""}
            options={depots.map((d) => ({
              value: d.id,
              label: `${d.code} — ${d.name}`,
            }))}
            placeholder="Depo seçin"
          />
          <FieldError message={state.fieldErrors?.parent_id} />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="code">Kod *</Label>
          <Input
            id="code"
            name="code"
            required
            placeholder={kind === "shelf" ? "A-01" : "SEVK"}
            style={{ textTransform: "uppercase" }}
            defaultValue={initial?.code ?? ""}
          />
          <FieldError message={state.fieldErrors?.code} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Ad *</Label>
          <Input
            id="name"
            name="name"
            required
            placeholder={
              kind === "shelf" ? "örn. A Koridoru Raf 01" : "örn. Sevkiyat Deposu"
            }
            defaultValue={initial?.name ?? ""}
          />
          <FieldError message={state.fieldErrors?.name} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notlar</Label>
        <Input id="notes" name="notes" defaultValue={initial?.notes ?? ""} />
        <FieldError message={state.fieldErrors?.notes} />
      </div>

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}

      <SubmitButton>
        {initial ? "Güncelle" : kind === "shelf" ? "Raf Ekle" : "Depo Ekle"}
      </SubmitButton>
    </form>
  );
}
