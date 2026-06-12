"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { groupLocations, type LocationOption } from "@/lib/locations";
import { companyModulePath } from "@/types/roles";

import { onboardLot, type OnboardLotState } from "../actions";

const initialState: OnboardLotState = {};

type MaterialOption = {
  id: string;
  code: string;
  name: string;
  type: "raw" | "finished";
  base_uom: string;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function OnboardingForm({
  companyId,
  materials,
  locations,
  defaultLocationId,
}: {
  companyId: string;
  materials: MaterialOption[];
  locations: LocationOption[];
  defaultLocationId: string | null;
}) {
  const [state, formAction] = useActionState(onboardLot, initialState);
  const lotInputRef = useRef<HTMLInputElement>(null);

  // Art arda giris: urun/SKT/konum form reset'inden etkilenmesin diye controlled.
  const [materialId, setMaterialId] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [locationId, setLocationId] = useState(defaultLocationId ?? "");

  useEffect(() => {
    if (state.created) {
      lotInputRef.current?.focus();
    }
  }, [state]);

  const finished = materials.filter((m) => m.type === "finished");
  const raw = materials.filter((m) => m.type === "raw");
  const locationGroups = groupLocations(locations);
  const selectedMaterial = materials.find((m) => m.id === materialId);

  return (
    <div className="space-y-4">
      {state.created ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
          <span>
            ✓ <span className="font-mono">{state.created.lot_number}</span>{" "}
            kaydedildi.
          </span>
          <Link
            href={companyModulePath(companyId, "lots", state.created.id, "label")}
            target="_blank"
            className="font-medium underline underline-offset-2"
          >
            Etiketi Yazdır
          </Link>
          <Link
            href={companyModulePath(companyId, "lots", state.created.id)}
            className="text-xs underline underline-offset-2"
          >
            Lotu Gör
          </Link>
        </div>
      ) : null}

      <form action={formAction} className="space-y-4 rounded-md border border-border bg-card/40 p-4">
        <input type="hidden" name="company_id" value={companyId} />

        <div className="space-y-1.5">
          <Label htmlFor="material_id">Ürün *</Label>
          <select
            id="material_id"
            name="material_id"
            required
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="" disabled>
              — Ürün seçiniz —
            </option>
            {finished.length > 0 ? (
              <optgroup label="Bitmiş Ürünler">
                {finished.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {raw.length > 0 ? (
              <optgroup label="Hammaddeler">
                {raw.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
          <FieldError message={state.fieldErrors?.material_id} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lot_number">Lot Numarası *</Label>
            <Input
              id="lot_number"
              name="lot_number"
              required
              ref={lotInputRef}
              placeholder="Ürün üzerindeki lot no"
            />
            <FieldError message={state.fieldErrors?.lot_number} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quantity">
              Miktar *{" "}
              {selectedMaterial ? (
                <span className="text-muted-foreground">
                  ({selectedMaterial.base_uom})
                </span>
              ) : null}
            </Label>
            <Input
              id="quantity"
              name="quantity"
              type="number"
              step="0.000001"
              min="0"
              required
              placeholder="örn. 10"
            />
            <FieldError message={state.fieldErrors?.quantity} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="expiry_date">Son Kullanma Tarihi</Label>
            <Input
              id="expiry_date"
              name="expiry_date"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
            <FieldError message={state.fieldErrors?.expiry_date} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location_id">Konum (Depo / Raf) *</Label>
            <select
              id="location_id"
              name="location_id"
              required
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="" disabled>
                — Konum seçiniz —
              </option>
              {locationGroups.map((group) => (
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
            </select>
            <FieldError message={state.fieldErrors?.location_id} />
          </div>
        </div>

        {state.error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {state.error}
          </p>
        ) : null}

        <SubmitButton pendingLabel="Kaydediliyor...">
          Kaydet ve Sıradakine Geç
        </SubmitButton>
      </form>
    </div>
  );
}
