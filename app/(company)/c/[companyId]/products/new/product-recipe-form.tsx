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
  createProductWithRecipe,
  type ProductRecipeFormState,
} from "../actions";

const initialState: ProductRecipeFormState = {};

const UOM_OPTIONS = [
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "mg", label: "mg" },
  { value: "mL", label: "mL" },
  { value: "L", label: "L" },
  { value: "unit", label: "adet" },
];

interface RawMaterialOption {
  id: string;
  code: string;
  name: string;
  base_uom: string;
  material_lots:
    | Array<{
        quantity_on_hand: number;
        status: string;
        deleted_at: string | null;
      }>
    | null;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Olusturuluyor..." : "Urun ve Recete Olustur"}
    </Button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

function formatQuantity(value: number): string {
  return Number(value).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

export function ProductRecipeForm({
  companyId,
  rawMaterials,
}: {
  companyId: string;
  rawMaterials: RawMaterialOption[];
}) {
  const [state, formAction] = useActionState(
    createProductWithRecipe,
    initialState,
  );
  const cancelHref = companyModulePath(companyId, "products");

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="company_id" value={companyId} />

      <section className="space-y-4 rounded-md border border-border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold">Urun Karti</h2>
          <p className="text-xs text-muted-foreground">
            Urun kodu URN-01 formatinda otomatik verilir.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Kod</Label>
            <Input value="URN-01 otomatik" disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product_name">Urun Adi *</Label>
            <Input id="product_name" name="product_name" required />
            <FieldError message={state.fieldErrors?.product_name} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product_uom">Urun Baz Birimi *</Label>
            <select
              id="product_uom"
              name="product_uom"
              required
              defaultValue="unit"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {UOM_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors?.product_uom} />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-md border border-border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold">Recete Bilgisi</h2>
          <p className="text-xs text-muted-foreground">
            Recete kodu REC-01 formatinda otomatik verilir.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Kod</Label>
            <Input value="REC-01 otomatik" disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recipe_name">Recete Adi *</Label>
            <Input id="recipe_name" name="recipe_name" required />
            <FieldError message={state.fieldErrors?.recipe_name} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="yield_quantity">Verim Miktari *</Label>
            <Input
              id="yield_quantity"
              name="yield_quantity"
              type="number"
              step="0.000001"
              min="0"
              required
              placeholder="1000"
            />
            <FieldError message={state.fieldErrors?.yield_quantity} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="yield_uom">Verim Birimi *</Label>
            <select
              id="yield_uom"
              name="yield_uom"
              required
              defaultValue="unit"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {UOM_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors?.yield_uom} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Hammadde ve Ambalaj Secimi</h2>
          <p className="text-xs text-muted-foreground">
            Urunun recetesinde kullanilacak kayitli malzemeleri secin.
          </p>
        </div>

        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Sec</th>
                <th className="px-3 py-2 text-left font-medium">Malzeme</th>
                <th className="px-3 py-2 text-right font-medium">Serbest Stok</th>
                <th className="px-3 py-2 text-right font-medium">Karantina</th>
                <th className="px-3 py-2 text-right font-medium">Miktar</th>
                <th className="px-3 py-2 text-left font-medium">Birim</th>
              </tr>
            </thead>
            <tbody>
              {rawMaterials.map((material) => {
                const lots = (material.material_lots ?? []).filter(
                  (lot) => lot.deleted_at === null,
                );
                const released = lots
                  .filter((lot) => lot.status === "released")
                  .reduce((sum, lot) => sum + Number(lot.quantity_on_hand), 0);
                const quarantine = lots
                  .filter((lot) => lot.status === "quarantine")
                  .reduce((sum, lot) => sum + Number(lot.quantity_on_hand), 0);

                return (
                  <tr key={material.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        name="selected_material_id"
                        value={material.id}
                        className="h-4 w-4 rounded border-input"
                      />
                      <input type="hidden" name="item_material_id" value={material.id} />
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {material.code}
                      </span>{" "}
                      {material.name}
                      <FieldError message={state.itemErrors?.[material.id]} />
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {formatQuantity(released)} {material.base_uom}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                      {formatQuantity(quarantine)} {material.base_uom}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        name="item_quantity"
                        type="number"
                        step="0.000001"
                        min="0"
                        className="ml-auto w-32 text-right"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        name="item_uom"
                        defaultValue={material.base_uom}
                        className="flex h-9 w-28 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {UOM_OPTIONS.map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-1.5">
        <Label htmlFor="notes">Notlar</Label>
        <Textarea id="notes" name="notes" rows={3} />
      </section>

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <SubmitButton />
        <Link href={cancelHref}>
          <Button type="button" variant="outline">
            Iptal
          </Button>
        </Link>
      </div>
    </form>
  );
}
