"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { companyModulePath } from "@/types/roles";

import {
  completeProductionBatch,
  type CompleteBatchState,
} from "../../actions";

interface LotOption {
  id: string;
  lot_number: string;
  expiry_date: string | null;
  quantity_on_hand: number;
  unit_cost: number | null;
  currency: string | null;
}

interface FormItem {
  recipe_item_id: string;
  position: number;
  material_id: string;
  material_code: string;
  material_name: string;
  base_uom: string;
  recipe_quantity: number;
  uom: string;
  planned_consumption: number;
  lots: LotOption[];
}

interface CompleteBatchFormProps {
  companyId: string;
  orderId: string;
  batchId: string;
  batchNumber: string;
  orderCode: string;
  plannedQuantity: number;
  plannedUom: string;
  outputBaseUom: string;
  items: FormItem[];
}

const initialState: CompleteBatchState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Tamamlanıyor..." : "Partiyi Tamamla"}
    </Button>
  );
}

function formatNumber(n: number, max = 6): string {
  return Number(n).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: max,
  });
}

export function CompleteBatchForm({
  companyId,
  orderId,
  batchId,
  batchNumber,
  orderCode,
  plannedQuantity,
  plannedUom,
  outputBaseUom,
  items,
}: CompleteBatchFormProps) {
  const [state, formAction] = useActionState(
    completeProductionBatch.bind(null, companyId),
    initialState,
  );
  const cancelHref = companyModulePath(companyId, "production", orderId);

  const [actualQty, setActualQty] = useState<string>(String(plannedQuantity));
  const actualNum = Number(actualQty);
  const scale =
    Number.isFinite(actualNum) && actualNum > 0
      ? actualNum / plannedQuantity
      : 1;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="batch_id" value={batchId} />

      <section className="space-y-3 rounded-md border border-border bg-card/40 p-4">
        <h2 className="text-sm font-semibold">Çıkış (Bitmiş Ürün)</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="actual_quantity">
              Gerçek Üretim Miktarı *{" "}
              <span className="text-muted-foreground">({plannedUom})</span>
            </Label>
            <Input
              id="actual_quantity"
              name="actual_quantity"
              type="number"
              step="0.000001"
              min="0"
              required
              value={actualQty}
              onChange={(e) => setActualQty(e.target.value)}
            />
            {state.fieldErrors?.actual_quantity ? (
              <p className="text-xs text-destructive">
                {state.fieldErrors.actual_quantity}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="output_lot_number">Çıkış Lot Numarası *</Label>
            <Input
              id="output_lot_number"
              name="output_lot_number"
              required
              defaultValue={`${orderCode}-${batchNumber}`}
              placeholder="LOT-FG-000001"
            />
            {state.fieldErrors?.output_lot_number ? (
              <p className="text-xs text-destructive">
                {state.fieldErrors.output_lot_number}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="output_expiry_date">Çıkış SKT</Label>
            <Input
              id="output_expiry_date"
              name="output_expiry_date"
              type="date"
            />
            {state.fieldErrors?.output_expiry_date ? (
              <p className="text-xs text-destructive">
                {state.fieldErrors.output_expiry_date}
              </p>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Çıkış lotu &quot;karantina&quot; durumunda açılır. QC sonrası
          Lotlar ekranından serbest bırakabilirsiniz. Çıkış birim maliyeti
          tüketilen lotların birim maliyetlerinden otomatik hesaplanır
          (toplam maliyet ÷ gerçek miktar). Çıkış ürün base UoM:{" "}
          <span className="font-mono">{outputBaseUom}</span>.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Tüketilen Loylar (Aktif Reçete Kalemleri)</h2>
        <p className="text-xs text-muted-foreground">
          Plan, gerçek üretim miktarına ({formatNumber(Number(actualQty || 0))}{" "}
          {plannedUom}) ölçeklenmiştir. Her kalem için tek bir lot
          seçebilirsiniz; çoklu lot tüketimi sonraki adımlarda gelecektir.
        </p>

        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">Malzeme</th>
                <th className="px-3 py-2 text-right font-medium">Plan</th>
                <th className="px-3 py-2 text-left font-medium">Lot</th>
                <th className="px-3 py-2 text-right font-medium">Tüketim</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const plannedItem = item.planned_consumption * scale;
                const errorKey = `${item.recipe_item_id}.row`;
                const lotErr =
                  state.fieldErrors?.items?.[`${item.recipe_item_id}.lot_id`];
                const qtyErr =
                  state.fieldErrors?.items?.[
                    `${item.recipe_item_id}.quantity`
                  ];
                const generalErr = state.fieldErrors?.items?.[errorKey];
                return (
                  <tr
                    key={item.recipe_item_id}
                    className="border-t border-border align-top"
                  >
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {item.position}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs">
                        {item.material_code}
                      </span>
                      <span className="ml-1">— {item.material_name}</span>
                      <input
                        type="hidden"
                        name="recipe_item_id"
                        value={item.recipe_item_id}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {formatNumber(plannedItem)} {item.uom}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        name="lot_id"
                        required
                        defaultValue=""
                        className="flex h-9 w-full min-w-[14rem] rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="" disabled>
                          — Lot seçiniz —
                        </option>
                        {item.lots.map((lot) => (
                          <option key={lot.id} value={lot.id}>
                            {lot.lot_number} · stok:{" "}
                            {formatNumber(lot.quantity_on_hand)} {item.base_uom}
                            {lot.expiry_date ? ` · SKT ${lot.expiry_date}` : ""}
                            {lot.unit_cost !== null
                              ? ` · ${formatNumber(lot.unit_cost, 4)} ${lot.currency ?? ""}`
                              : ""}
                          </option>
                        ))}
                      </select>
                      {lotErr ? (
                        <p className="mt-1 text-xs text-destructive">
                          {lotErr}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        name="quantity"
                        type="number"
                        step="0.000001"
                        min="0"
                        required
                        defaultValue={plannedItem.toFixed(6)}
                        className="ml-auto w-32 text-right font-mono"
                      />
                      {qtyErr ? (
                        <p className="mt-1 text-xs text-destructive">
                          {qtyErr}
                        </p>
                      ) : null}
                      {generalErr ? (
                        <p className="mt-1 text-xs text-destructive">
                          {generalErr}
                        </p>
                      ) : null}
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
            İptal
          </Button>
        </Link>
      </div>
    </form>
  );
}
