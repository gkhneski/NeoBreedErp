"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { companyModulePath } from "@/types/roles";

import {
  createRecipe,
  updateRecipe,
  type RecipeFormState,
} from "../actions";

const initialState: RecipeFormState = {};

const UOM_OPTIONS = [
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "mg", label: "mg" },
  { value: "mL", label: "mL" },
  { value: "L", label: "L" },
  { value: "unit", label: "adet" },
];

type RecipeInitial = {
  id: string;
  code: string;
  finished_material_id: string;
  name: string;
  mode: "quantity" | "percentage";
  yield_quantity: number;
  yield_uom: string;
  notes: string | null;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

interface RecipeFormProps {
  companyId: string;
  finishedMaterials: Array<{ id: string; label: string }>;
  initial?: RecipeInitial;
}

export function RecipeForm({
  companyId,
  finishedMaterials,
  initial,
}: RecipeFormProps) {
  const [state, formAction] = useActionState(
    initial ? updateRecipe : createRecipe,
    initialState,
  );
  const cancelHref = initial
    ? companyModulePath(companyId, "recipes", initial.id)
    : companyModulePath(companyId, "recipes");

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="company_id" value={companyId} />
      {initial ? <input type="hidden" name="recipe_id" value={initial.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="finished_material_id">Bitmiş Ürün *</Label>
          <select
            id="finished_material_id"
            name="finished_material_id"
            required
            defaultValue={initial?.finished_material_id ?? ""}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="" disabled>
              -- Seçiniz --
            </option>
            {finishedMaterials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <FieldError message={state.fieldErrors?.finished_material_id} />
        </div>

        <div className="space-y-1.5">
          <Label>Kod</Label>
          <Input value={initial?.code ?? "REC-01 otomatik"} disabled />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Reçete Adı *</Label>
          <Input id="name" name="name" required defaultValue={initial?.name ?? ""} />
          <FieldError message={state.fieldErrors?.name} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mode">Mod *</Label>
          <select
            id="mode"
            name="mode"
            required
            defaultValue={initial?.mode ?? "quantity"}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="quantity">Miktar bazlı</option>
            <option value="percentage">Yüzde bazlı</option>
          </select>
          <FieldError message={state.fieldErrors?.mode} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="yield_quantity">Verim Miktarı *</Label>
            <Input
              id="yield_quantity"
              name="yield_quantity"
              type="number"
              step="0.000001"
              min="0"
              required
              placeholder="1.000000"
              defaultValue={initial?.yield_quantity ?? ""}
            />
            <FieldError message={state.fieldErrors?.yield_quantity} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="yield_uom">Verim Birimi *</Label>
            <select
              id="yield_uom"
              name="yield_uom"
              required
              defaultValue={initial?.yield_uom ?? ""}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="" disabled>
                --
              </option>
              {UOM_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors?.yield_uom} />
          </div>
        </div>
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
        <SubmitButton>{initial ? "Güncelle" : "Taslağı Oluştur"}</SubmitButton>
        <Link href={cancelHref}>
          <Button type="button" variant="outline">
            İptal
          </Button>
        </Link>
      </div>
    </form>
  );
}
