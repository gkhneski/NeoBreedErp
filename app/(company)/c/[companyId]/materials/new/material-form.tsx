"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { companyModulePath } from "@/types/roles";

import { createMaterial, type MaterialFormState } from "../actions";

const initialState: MaterialFormState = {};

const UOM_OPTIONS = [
  { value: "g", label: "g (gram)" },
  { value: "kg", label: "kg (kilogram)" },
  { value: "mg", label: "mg (miligram)" },
  { value: "mL", label: "mL (mililitre)" },
  { value: "L", label: "L (litre)" },
  { value: "unit", label: "adet" },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Kaydediliyor..." : "Kaydet"}
    </Button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function MaterialForm({ companyId }: { companyId: string }) {
  const [state, formAction] = useFormState(createMaterial, initialState);
  const cancelHref = companyModulePath(companyId, "materials");

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="company_id" value={companyId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="code">Kod *</Label>
          <Input id="code" name="code" required placeholder="RM-001" />
          <FieldError message={state.fieldErrors?.code} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Ad *</Label>
          <Input id="name" name="name" required />
          <FieldError message={state.fieldErrors?.name} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="type">Tip *</Label>
          <select
            id="type"
            name="type"
            required
            defaultValue="raw"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="raw">Hammadde</option>
            <option value="finished">Bitmiş Ürün</option>
          </select>
          <FieldError message={state.fieldErrors?.type} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="base_uom">Baz Birim *</Label>
          <select
            id="base_uom"
            name="base_uom"
            required
            defaultValue=""
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="" disabled>
              — Seçiniz —
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
          <Label htmlFor="density">Yoğunluk (g/mL)</Label>
          <Input
            id="density"
            name="density"
            type="number"
            step="0.000001"
            min="0"
            placeholder="örn. 1.000000"
          />
          <p className="text-xs text-muted-foreground">
            Kütle/hacim dönüşümü gerekiyorsa zorunlu.
          </p>
          <FieldError message={state.fieldErrors?.density} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notlar</Label>
        <Textarea id="notes" name="notes" rows={3} />
        <FieldError message={state.fieldErrors?.notes} />
      </div>

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <SubmitButton />
        <Link href={cancelHref}>
          <Button type="button" variant="outline">
            İptal
          </Button>
        </Link>
      </div>
    </form>
  );
}
