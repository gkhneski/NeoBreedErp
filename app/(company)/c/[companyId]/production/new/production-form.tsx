"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function ProductionOrderForm({
  companyId,
  recipes,
  customers,
}: ProductionOrderFormProps) {
  const [state, formAction] = useActionState(
    createProductionOrder.bind(null, companyId),
    initialState,
  );
  const [recipeId, setRecipeId] = useState<string>("");
  const [plannedQty, setPlannedQty] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const cancelHref = companyModulePath(companyId, "production");

  const selected = useMemo(
    () => recipes.find((r) => r.id === recipeId) ?? null,
    [recipes, recipeId],
  );

  function handleRecipeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
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
          <select
            id="recipe_id"
            name="recipe_id"
            required
            value={recipeId}
            onChange={handleRecipeChange}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="" disabled>
              — Seçiniz —
            </option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} v{r.version} — {r.name} ({r.material_code} —{" "}
                {r.material_name})
              </option>
            ))}
          </select>
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
          <select
            id="customer_id"
            name="customer_id"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">— Kendi üretimimiz —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
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
