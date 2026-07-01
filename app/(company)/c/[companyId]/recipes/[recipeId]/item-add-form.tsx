"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";

import { addRecipeItem, type RecipeItemFormState } from "../actions";

const initialState: RecipeItemFormState = {};

const UOM_OPTIONS = [
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "mg", label: "mg" },
  { value: "mL", label: "mL" },
  { value: "L", label: "L" },
  { value: "unit", label: "adet" },
];

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

interface RecipeItemAddFormProps {
  companyId: string;
  recipeId: string;
  recipeMode: "quantity" | "percentage";
  rawMaterials: Array<{ id: string; label: string }>;
}

export function RecipeItemAddForm({
  companyId,
  recipeId,
  recipeMode,
  rawMaterials,
}: RecipeItemAddFormProps) {
  const [state, formAction] = useActionState(addRecipeItem, initialState);

  if (rawMaterials.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
        Bu firmaya tanımlı hammadde yok. Önce malzemeler bölümünden hammadde ekleyin.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-border bg-card p-4">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="recipe_id" value={recipeId} />

      <div className="grid gap-3 sm:grid-cols-12">
        <div className="space-y-1.5 sm:col-span-5">
          <Label htmlFor="material_id">Hammadde *</Label>
          <SearchableSelect
            id="material_id"
            name="material_id"
            options={rawMaterials.map((m) => ({ value: m.id, label: m.label }))}
            placeholder="Hammadde / YM ara — ad veya kod…"
          />
          <FieldError message={state.fieldErrors?.material_id} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="quantity">Miktar *</Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            step="0.000001"
            min="0"
            required
          />
          <FieldError message={state.fieldErrors?.quantity} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="uom">Birim *</Label>
          <select
            id="uom"
            name="uom"
            required
            defaultValue=""
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="" disabled>
              —
            </option>
            {UOM_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
          <FieldError message={state.fieldErrors?.uom} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="percentage">
            {recipeMode === "percentage" ? "% *" : "% (ops.)"}
          </Label>
          <Input
            id="percentage"
            name="percentage"
            type="number"
            step="0.0001"
            min="0"
            max="100"
            required={recipeMode === "percentage"}
          />
          <FieldError message={state.fieldErrors?.percentage} />
        </div>
        <div className="flex items-center sm:col-span-1 sm:pt-6">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              name="active"
              defaultChecked
              className="h-4 w-4 rounded border-input"
            />
            Aktif
          </label>
        </div>
      </div>

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}

      <SubmitButton size="sm" pendingLabel="Ekleniyor...">Kalem Ekle</SubmitButton>
    </form>
  );
}
