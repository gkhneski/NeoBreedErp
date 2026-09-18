"use client";

import { Plus, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SearchableSelect,
  type SearchableOption,
} from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { groupLocations, type LocationOption } from "@/lib/locations";
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
  locations: LocationOption[];
  defaultLocationId: string | null;
}

interface AllocRow {
  key: string;
  lotId: string;
  qty: string;
}

const initialState: CompleteBatchState = {};

function formatNumber(n: number, max = 6): string {
  return Number(n).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: max,
  });
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function qtyString(n: number): string {
  return String(round6(n));
}

// Lots arrive sorted by expiry (FEFO); fill the need lot by lot.
function allocateFefo(item: FormItem, needed: number): AllocRow[] {
  const rows: AllocRow[] = [];
  let remaining = round6(needed);
  for (const lot of item.lots) {
    if (remaining <= 0) break;
    const take = Math.min(lot.quantity_on_hand, remaining);
    if (take <= 0) continue;
    rows.push({
      key: `${item.recipe_item_id}:${rows.length}`,
      lotId: lot.id,
      qty: qtyString(take),
    });
    remaining = round6(remaining - take);
  }
  if (rows.length === 0) {
    rows.push({
      key: `${item.recipe_item_id}:0`,
      lotId: "",
      qty: qtyString(needed),
    });
  }
  return rows;
}

function allocateAll(items: FormItem[], scale: number): Record<string, AllocRow[]> {
  return Object.fromEntries(
    items.map((item) => [
      item.recipe_item_id,
      allocateFefo(item, item.planned_consumption * scale),
    ]),
  );
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
  locations,
  defaultLocationId,
}: CompleteBatchFormProps) {
  const locationGroups = groupLocations(locations);
  const locationOptions: SearchableOption[] = locationGroups.flatMap((group) => {
    const groupLabel = `${group.depot.code} — ${group.depot.name}`;
    return [
      { value: group.depot.id, label: groupLabel, group: groupLabel },
      ...group.shelves.map((shelf) => ({
        value: shelf.id,
        label: `${shelf.code} — ${shelf.name}`,
        group: groupLabel,
      })),
    ];
  });
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

  const [alloc, setAlloc] = useState<Record<string, AllocRow[]>>(() =>
    allocateAll(items, 1),
  );

  function updateRow(itemId: string, key: string, patch: Partial<AllocRow>) {
    setAlloc((prev) => ({
      ...prev,
      [itemId]: prev[itemId].map((r) => (r.key === key ? { ...r, ...patch } : r)),
    }));
  }

  function removeRow(itemId: string, key: string) {
    setAlloc((prev) => ({
      ...prev,
      [itemId]: prev[itemId].filter((r) => r.key !== key),
    }));
  }

  function addRow(item: FormItem, plannedItem: number) {
    setAlloc((prev) => {
      const rows = prev[item.recipe_item_id];
      const used = new Set(rows.map((r) => r.lotId));
      const nextLot = item.lots.find((l) => !used.has(l.id));
      const total = rows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
      const missing = Math.max(round6(plannedItem - total), 0);
      const qty = nextLot ? Math.min(nextLot.quantity_on_hand, missing) : missing;
      return {
        ...prev,
        [item.recipe_item_id]: [
          ...rows,
          {
            key: `${item.recipe_item_id}:n${Date.now()}`,
            lotId: nextLot?.id ?? "",
            qty: qty > 0 ? qtyString(qty) : "",
          },
        ],
      };
    });
  }

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
        <div className="space-y-1.5">
          <Label htmlFor="location_id">Çıkış Konumu (Depo / Raf)</Label>
          <SearchableSelect
            id="location_id"
            name="location_id"
            options={locationOptions}
            placeholder="Depo / raf ara…"
            defaultValue={defaultLocationId ?? ""}
            className="max-w-sm"
          />
          <p className="text-xs text-muted-foreground">
            Çıkış lotu seçilen depoya veya rafa yerleştirilir.
          </p>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            Tüketilen Lotlar (Aktif Reçete Kalemleri)
          </h2>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAlloc(allocateAll(items, scale))}
          >
            Lotları otomatik dağıt (SKT sırasıyla)
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Plan, gerçek üretim miktarına ({formatNumber(Number(actualQty || 0))}{" "}
          {plannedUom}) ölçeklenmiştir. Tek lot yetmiyorsa &quot;+ Lot
          ekle&quot; ile aynı kalemi birden fazla lottan tüketebilirsiniz;
          varsayılan dağıtım SKT&apos;si en yakın lottan başlar.
        </p>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">Malzeme</th>
                <th className="px-3 py-2 text-right font-medium">Plan</th>
                <th className="px-3 py-2 text-left font-medium">
                  Lot · Tüketim
                </th>
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
                const rows = alloc[item.recipe_item_id] ?? [];
                const total = round6(
                  rows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0),
                );
                const available = round6(
                  item.lots.reduce((sum, l) => sum + l.quantity_on_hand, 0),
                );
                const diff = round6(total - plannedItem);
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
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {formatNumber(plannedItem)} {item.uom}
                    </td>
                    <td className="space-y-2 px-3 py-2">
                      {rows.map((row) => {
                        const rowLot = item.lots.find((l) => l.id === row.lotId);
                        const overStock =
                          rowLot !== undefined &&
                          (Number(row.qty) || 0) > rowLot.quantity_on_hand;
                        return (
                          <div key={row.key}>
                            <div className="flex items-center gap-2">
                              <input
                                type="hidden"
                                name="recipe_item_id"
                                value={item.recipe_item_id}
                              />
                              <SearchableSelect
                                name="lot_id"
                                required
                                value={row.lotId}
                                onChange={(next) =>
                                  updateRow(item.recipe_item_id, row.key, {
                                    lotId: next,
                                  })
                                }
                                placeholder="— Lot seçiniz —"
                                className="min-w-[14rem] flex-1"
                                options={item.lots.map((lot) => ({
                                  value: lot.id,
                                  disabled: rows.some(
                                    (r) => r.key !== row.key && r.lotId === lot.id,
                                  ),
                                  label:
                                    `${lot.lot_number} · stok: ${formatNumber(lot.quantity_on_hand)} ${item.base_uom}` +
                                    (lot.expiry_date
                                      ? ` · SKT ${lot.expiry_date}`
                                      : "") +
                                    (lot.unit_cost !== null
                                      ? ` · ${formatNumber(lot.unit_cost, 4)} ${lot.currency ?? ""}`
                                      : ""),
                                }))}
                              />
                              <Input
                                name="quantity"
                                type="number"
                                step="0.000001"
                                min="0"
                                required
                                value={row.qty}
                                onChange={(e) =>
                                  updateRow(item.recipe_item_id, row.key, {
                                    qty: e.target.value,
                                  })
                                }
                                className="w-32 text-right font-mono"
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                aria-label="Lot satırını kaldır"
                                disabled={rows.length === 1}
                                onClick={() =>
                                  removeRow(item.recipe_item_id, row.key)
                                }
                                className="h-8 w-8 shrink-0 p-0"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            {overStock ? (
                              <p className="mt-1 text-xs text-destructive">
                                Bu lotta yalnızca{" "}
                                {formatNumber(rowLot.quantity_on_hand)}{" "}
                                {item.base_uom} var — kalanı için lot ekleyin.
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {rows.length < item.lots.length ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => addRow(item, plannedItem)}
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            Lot ekle
                          </Button>
                        ) : (
                          <span />
                        )}
                        <p
                          className={
                            "font-mono text-xs " +
                            (diff === 0
                              ? "text-muted-foreground"
                              : "text-amber-600")
                          }
                        >
                          Toplam {formatNumber(total)} / {formatNumber(plannedItem)}{" "}
                          {item.uom}
                        </p>
                      </div>
                      {available < round6(plannedItem) ? (
                        <p className="text-xs text-destructive">
                          Serbest stok yetersiz: toplam{" "}
                          {formatNumber(available)} {item.base_uom} var,{" "}
                          {formatNumber(round6(plannedItem - available))} eksik.
                        </p>
                      ) : null}
                      {lotErr ? (
                        <p className="mt-1 text-xs text-destructive">
                          {lotErr}
                        </p>
                      ) : null}
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
        <SubmitButton pendingLabel="Tamamlanıyor...">Partiyi Tamamla</SubmitButton>
        <Link href={cancelHref}>
          <Button type="button" variant="outline">
            İptal
          </Button>
        </Link>
      </div>
    </form>
  );
}
