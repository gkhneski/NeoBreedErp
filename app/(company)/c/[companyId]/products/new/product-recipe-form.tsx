"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
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

type TrendyolProductOption = {
  barcode: string;
  title: string | null;
  image_url: string | null;
};

type CustomerOption = {
  id: string;
  code: string;
  name: string;
};

export function ProductRecipeForm({
  companyId,
  rawMaterials,
  trendyolProducts,
  customers,
}: {
  companyId: string;
  rawMaterials: RawMaterialOption[];
  trendyolProducts: TrendyolProductOption[];
  customers: CustomerOption[];
}) {
  const [state, formAction] = useActionState(
    createProductWithRecipe,
    initialState,
  );
  const cancelHref = companyModulePath(companyId, "products");

  const [productName, setProductName] = useState("");
  const [productBarcode, setProductBarcode] = useState("");
  const [fasonCustomerId, setFasonCustomerId] = useState("");
  const selectedTy = trendyolProducts.find((p) => p.barcode === productBarcode);
  const isFason = fasonCustomerId !== "";

  const [query, setQuery] = useState("");
  const q = query.trim().toLocaleLowerCase("tr");
  const matchIds = useMemo(() => {
    const set = new Set<string>();
    for (const m of rawMaterials) {
      if (q === "" || `${m.code} ${m.name}`.toLocaleLowerCase("tr").includes(q)) {
        set.add(m.id);
      }
    }
    return set;
  }, [rawMaterials, q]);
  const matchCount = matchIds.size;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="company_id" value={companyId} />

      <section className="space-y-4 rounded-md border border-border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold">Ürün Kartı</h2>
          <p className="text-xs text-muted-foreground">
            Ürün kodu URN-01 formatında otomatik verilir.
          </p>
        </div>

        {customers.length > 0 ? (
          <div className="space-y-1.5 rounded-xl border border-border bg-background p-3">
            <Label htmlFor="fason_customer_id">Fason Müşterisi (opsiyonel)</Label>
            <select
              id="fason_customer_id"
              name="fason_customer_id"
              value={fasonCustomerId}
              onChange={(e) => {
                setFasonCustomerId(e.target.value);
                if (e.target.value !== "") setProductBarcode("");
              }}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">— Kendi ürünümüz —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Başka bir firma için fason üretiyorsanız müşteriyi seçin. Fason
              ürünler ayrı sekmede listelenir ve Trendyol akışına girmez.
            </p>
          </div>
        ) : null}

        {trendyolProducts.length > 0 && !isFason ? (
          <div className="space-y-1.5 rounded-xl border border-border bg-background p-3">
            <Label htmlFor="ty_product">Trendyol ürününden doldur (opsiyonel)</Label>
            <div className="flex items-center gap-3">
              {selectedTy?.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedTy.image_url}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded border border-border object-cover"
                />
              ) : null}
              <select
                id="ty_product"
                value={productBarcode}
                onChange={(e) => {
                  const p = trendyolProducts.find((x) => x.barcode === e.target.value);
                  setProductBarcode(e.target.value);
                  if (p) setProductName(p.title ?? "");
                }}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">— Trendyol&apos;dan seç (ad + barkod otomatik dolar) —</option>
                {trendyolProducts.map((p) => (
                  <option key={p.barcode} value={p.barcode}>
                    {(p.title ?? "—").slice(0, 70)} · {p.barcode}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              Seçince ürün adı Trendyol&apos;daki adla birebir dolar ve barkod
              ürüne kaydedilir; istersen adı yine de düzenleyebilirsin.
            </p>
          </div>
        ) : null}

        <input type="hidden" name="product_barcode" value={productBarcode} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Kod</Label>
            <Input value="URN-01 otomatik" disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product_name">Ürün Adı *</Label>
            <Input
              id="product_name"
              name="product_name"
              required
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
            />
            <FieldError message={state.fieldErrors?.product_name} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product_uom">Ürün Baz Birimi *</Label>
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
          <h2 className="text-sm font-semibold">Reçete Bilgisi</h2>
          <p className="text-xs text-muted-foreground">
            Reçete kodu REC-01 formatında otomatik verilir.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Kod</Label>
            <Input value="REC-01 otomatik" disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recipe_name">Reçete Adı *</Label>
            <Input id="recipe_name" name="recipe_name" required />
            <FieldError message={state.fieldErrors?.recipe_name} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="yield_quantity">Verim Miktarı *</Label>
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
          <h2 className="text-sm font-semibold">Hammadde ve Ambalaj Seçimi</h2>
          <p className="text-xs text-muted-foreground">
            Ürünün reçetesinde kullanılacak kayıtlı malzemeleri seçin.
          </p>
        </div>

        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Malzeme ara: kod veya ad…"
            className="pl-9"
          />
        </div>
        {q !== "" ? (
          <p className="text-xs text-muted-foreground">
            {matchCount} malzeme eşleşti{" "}
            <span className="text-muted-foreground/70">
              (seçimleriniz korunur)
            </span>
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Seç</th>
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
                  <tr
                    key={material.id}
                    className={`border-t border-border ${matchIds.has(material.id) ? "" : "hidden"}`}
                  >
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
        <SubmitButton pendingLabel="Oluşturuluyor...">Ürün ve Reçete Oluştur</SubmitButton>
        <Link href={cancelHref}>
          <Button type="button" variant="outline">
            İptal
          </Button>
        </Link>
      </div>
    </form>
  );
}
