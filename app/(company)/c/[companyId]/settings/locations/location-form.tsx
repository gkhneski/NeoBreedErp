"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  notes: string | null;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function LocationForm({
  companyId,
  initial,
}: {
  companyId: string;
  initial?: LocationInitial;
}) {
  const [state, formAction] = useActionState(
    initial ? updateLocation : createLocation,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="company_id" value={companyId} />
      {initial ? (
        <input type="hidden" name="location_id" value={initial.id} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="code">Kod *</Label>
          <Input
            id="code"
            name="code"
            required
            placeholder="SEVK"
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
            placeholder="örn. Sevkiyat Deposu (NeuPharma Ltd.)"
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

      <SubmitButton>{initial ? "Güncelle" : "Depo Ekle"}</SubmitButton>
    </form>
  );
}
