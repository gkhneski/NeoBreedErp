"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { companyModulePath } from "@/types/roles";

import {
  createMaterial,
  updateMaterial,
  type MaterialFormState,
} from "../actions";
import { ALLERGEN_CODES, ALLERGEN_LABELS } from "../allergens";

const initialState: MaterialFormState = {};

const UOM_OPTIONS = [
  { value: "g", label: "g (gram)" },
  { value: "kg", label: "kg (kilogram)" },
  { value: "mg", label: "mg (miligram)" },
  { value: "mL", label: "mL (mililitre)" },
  { value: "L", label: "L (litre)" },
  { value: "unit", label: "adet" },
];

const STORAGE_SUGGESTIONS = [
  "Oda sicakligi (15-25 C)",
  "Soguk (2-8 C)",
  "Dondurulmus (-18 C)",
  "Kuru ve serin yer",
  "Isiktan uzak",
  "Kontrollu atmosfer",
];

type MaterialInitial = {
  id: string;
  code: string;
  name: string;
  type: "raw" | "finished";
  base_uom: string;
  density: number | null;
  default_supplier_id: string | null;
  allergen_flags: unknown;
  storage_conditions: string | null;
  regulatory_notes: string | null;
  notes: string | null;
};

interface MaterialFormProps {
  companyId: string;
  suppliers: Array<{ id: string; code: string; name: string }>;
  defaultType?: "raw" | "finished";
  preset?: "packaging";
  returnTo?: string;
  initial?: MaterialInitial;
}

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Kaydediliyor..." : editing ? "Guncelle" : "Kaydet"}
    </Button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function MaterialForm({
  companyId,
  suppliers,
  defaultType = "raw",
  preset,
  returnTo,
  initial,
}: MaterialFormProps) {
  const [state, formAction] = useActionState(
    initial ? updateMaterial : createMaterial,
    initialState,
  );
  const cancelHref = returnTo ?? companyModulePath(companyId, "materials");
  const selectedAllergens = Array.isArray(initial?.allergen_flags)
    ? initial.allergen_flags
    : [];
  const codePreview =
    initial?.code ??
    (preset === "packaging"
      ? "AMB-01 otomatik"
      : defaultType === "finished"
        ? "URN-01 otomatik"
        : "HAM-01 otomatik");

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="company_id" value={companyId} />
      {initial ? <input type="hidden" name="material_id" value={initial.id} /> : null}
      {preset ? <input type="hidden" name="preset" value={preset} /> : null}
      {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Kod</Label>
          <Input value={codePreview} disabled />
          {!initial ? (
            <p className="text-xs text-muted-foreground">
              Kod kayit sirasinda otomatik verilir.
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Ad *</Label>
          <Input id="name" name="name" required defaultValue={initial?.name ?? ""} />
          <FieldError message={state.fieldErrors?.name} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="type">Tip *</Label>
          <select
            id="type"
            name="type"
            required
            defaultValue={initial?.type ?? defaultType}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="raw">Hammadde</option>
            <option value="finished">Bitmis Urun</option>
          </select>
          <FieldError message={state.fieldErrors?.type} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="base_uom">Baz Birim *</Label>
          <select
            id="base_uom"
            name="base_uom"
            required
            defaultValue={initial?.base_uom ?? ""}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="" disabled>
              -- Seciniz --
            </option>
            {UOM_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
          <FieldError message={state.fieldErrors?.base_uom} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="density">Yogunluk (g/mL)</Label>
          <Input
            id="density"
            name="density"
            type="number"
            step="0.000001"
            min="0"
            placeholder="orn. 1.000000"
            defaultValue={initial?.density ?? ""}
          />
          <FieldError message={state.fieldErrors?.density} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="default_supplier_id">Varsayilan Tedarikci</Label>
          <select
            id="default_supplier_id"
            name="default_supplier_id"
            defaultValue={initial?.default_supplier_id ?? ""}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">-- Secilmedi --</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} - {s.name}
              </option>
            ))}
          </select>
          {suppliers.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Henuz tedarikci yok.{" "}
              <Link
                href={companyModulePath(companyId, "suppliers", "new")}
                className="underline"
              >
                Yeni tedarikci ekleyin
              </Link>
              .
            </p>
          ) : null}
          <FieldError message={state.fieldErrors?.default_supplier_id} />
        </div>
      </div>

      <fieldset className="space-y-2 rounded-md border border-border p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Alerjen Etiketleri
        </legend>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
          {ALLERGEN_CODES.map((code) => (
            <label
              key={code}
              className="flex items-center gap-2 rounded-sm px-1.5 py-1 text-xs hover:bg-secondary/40"
            >
              <input
                type="checkbox"
                name="allergen_flags"
                value={code}
                defaultChecked={selectedAllergens.includes(code)}
                className="h-3.5 w-3.5 rounded border-input"
              />
              <span>{ALLERGEN_LABELS[code]}</span>
            </label>
          ))}
        </div>
        <FieldError message={state.fieldErrors?.allergen_flags} />
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="storage_conditions">Saklama Kosullari</Label>
        <Input
          id="storage_conditions"
          name="storage_conditions"
          list="storage-options"
          placeholder="orn. Oda sicakligi (15-25 C)"
          defaultValue={initial?.storage_conditions ?? ""}
        />
        <datalist id="storage-options">
          {STORAGE_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <FieldError message={state.fieldErrors?.storage_conditions} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="regulatory_notes">Mevzuat Notlari</Label>
        <Textarea
          id="regulatory_notes"
          name="regulatory_notes"
          rows={3}
          defaultValue={initial?.regulatory_notes ?? ""}
        />
        <FieldError message={state.fieldErrors?.regulatory_notes} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notlar</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={initial?.notes ?? ""} />
        <FieldError message={state.fieldErrors?.notes} />
      </div>

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <SubmitButton editing={!!initial} />
        <Link href={cancelHref}>
          <Button type="button" variant="outline">
            Iptal
          </Button>
        </Link>
      </div>
    </form>
  );
}
