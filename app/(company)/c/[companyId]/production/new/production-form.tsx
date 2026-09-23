"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { companyModulePath } from "@/types/roles";

import {
  createProductionOrder,
  type ProductionOrderFormState,
} from "../actions";

const initialState: ProductionOrderFormState = {};

interface RecipeOption {
  id: string;
  code: string;
  name: string;
  version: number;
  yield_quantity: number;
  yield_uom: string;
  finished_material_id: string;
  material_code: string;
  material_name: string;
  fason_customer_id: string | null;
}

interface CustomerOption {
  id: string;
  code: string;
  name: string;
}

interface ProductionOrderFormProps {
  companyId: string;
  recipes: RecipeOption[];
  customers: CustomerOption[];
  defaultRecipeId?: string;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function ProductionOrderForm({
  companyId,
  recipes,
  customers,
  defaultRecipeId = "",
}: ProductionOrderFormProps) {
  const [state, formAction] = useActionState(
    createProductionOrder.bind(null, companyId),
    initialState,
  );
  const defaultRecipe = recipes.find((r) => r.id === defaultRecipeId) ?? null;
  const [recipeId, setRecipeId] = useState<string>(defaultRecipe?.id ?? "");
  const [plannedQty, setPlannedQty] = useState<string>(
    defaultRecipe ? String(defaultRecipe.yield_quantity) : "",
  );
  const [customerId, setCustomerId] = useState<string>(
    defaultRecipe?.fason_customer_id ?? "",
  );
  const cancelHref = companyModulePath(companyId, "production");

  const selected = useMemo(
    () => recipes.find((r) => r.id === recipeId) ?? null,
    [recipes, recipeId],
  );

  const recipeOptions = useMemo(
    () =>
      recipes.map((r) => ({
        value: r.id,
        label: `${r.code} v${r.version} — ${r.name} (${r.material_code} — ${r.material_name})`,
      })),
    [recipes],
  );
  const customerOptions = useMemo(
    () => customers.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
    [customers],
  );

  function handleRecipeChange(id: string) {
    setRecipeId(id);
    const recipe = recipes.find((r) => r.id === id);
    if (recipe) {
      setPlannedQty(String(recipe.yield_quantity));
      setCustomerId(recipe.fason_customer_id ?? "");
    }
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="recipe_id">Reçete *</Label>
          <SearchableSelect
            id="recipe_id"
            name="recipe_id"
            required
            options={recipeOptions}
            placeholder="— Seçiniz —"
            value={recipeId}
            onChange={handleRecipeChange}
          />
          <FieldError message={state.fieldErrors?.recipe_id} />
          {selected ? (
            <p className="text-xs text-muted-foreground">
              Bitmiş ürün:{" "}
              <span className="font-mono">{selected.material_code}</span> —{" "}
              {selected.material_name}. Verim:{" "}
              <span className="font-mono">{selected.yield_quantity}</span>{" "}
              {selected.yield_uom}.
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="planned_quantity">
            Hedef Miktar *{" "}
            {selected ? (
              <span className="text-muted-foreground">
                ({selected.yield_uom})
              </span>
            ) : null}
          </Label>
          <Input
            id="planned_quantity"
            name="planned_quantity"
            type="number"
            step="0.000001"
            min="0"
            required
            value={plannedQty}
            onChange={(e) => setPlannedQty(e.target.value)}
            placeholder="örn. 100.000000"
          />
          <FieldError message={state.fieldErrors?.planned_quantity} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="customer_id">Müşteri (Fason)</Label>
          <SearchableSelect
            id="customer_id"
            name="customer_id"
            options={customerOptions}
            emptyLabel="— Kendi üretimimiz —"
            placeholder="Müşteri ara…"
            value={customerId}
            onChange={(v) => setCustomerId(v)}
          />
          <FieldError message={state.fieldErrors?.customer_id} />
          <p className="text-xs text-muted-foreground">
            Başka bir firma adına üretiliyorsa seçin; boş bırakılırsa kendi
            üretiminizdir.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="planned_start_at">Planlanan Başlangıç</Label>
          <Input
            id="planned_start_at"
            name="planned_start_at"
            type="datetime-local"
          />
          <FieldError message={state.fieldErrors?.planned_start_at} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="planned_end_at">Planlanan Bitiş</Label>
          <Input
            id="planned_end_at"
            name="planned_end_at"
            type="datetime-local"
          />
          <FieldError message={state.fieldErrors?.planned_end_at} />
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
        <SubmitButton>Üretim Emri Oluştur</SubmitButton>
        <Link href={cancelHref}>
          <Button type="button" variant="outline">
            İptal
          </Button>
        </Link>
      </div>
    </form>
  );
}
