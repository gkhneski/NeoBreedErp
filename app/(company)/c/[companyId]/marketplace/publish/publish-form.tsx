"use client";

import { useActionState, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

import { publishProductToTrendyol, type PublishState } from "./actions";

type Product = { id: string; code: string; name: string; barcode: string | null };
type AttrValue = { id: number; name: string };

const INITIAL: PublishState = {};

// Common Trendyol cargo company ids (seller can change to match their contract).
const CARGO_OPTIONS = [
  { id: 10, name: "Trendyol Express" },
  { id: 17, name: "Aras Kargo" },
  { id: 9, name: "Yurtiçi Kargo" },
  { id: 19, name: "MNG Kargo" },
  { id: 30, name: "Sürat Kargo" },
  { id: 38, name: "PTT Kargo" },
];

export function PublishForm({
  companyId,
  products,
  categoryId,
  defaultBrand,
  formValues,
  aromaValues,
}: {
  companyId: string;
  products: Product[];
  categoryId: number;
  defaultBrand: string;
  formValues: AttrValue[];
  aromaValues: AttrValue[];
}) {
  const [state, formAction] = useActionState(
    publishProductToTrendyol.bind(null, companyId),
    INITIAL,
  );
  const [selected, setSelected] = useState<Product | null>(products[0] ?? null);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="category_id" value={categoryId} />

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="material_id">ERP Ürünü *</Label>
            <select
              id="material_id"
              name="material_id"
              required
              value={selected?.id ?? ""}
              onChange={(e) =>
                setSelected(products.find((p) => p.id === e.target.value) ?? null)
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="barcode">Barkod (GTIN) *</Label>
            <Input
              id="barcode"
              name="barcode"
              required
              defaultValue={selected?.barcode ?? ""}
              key={selected?.id}
              placeholder="86..."
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="brand_name">Marka *</Label>
            <Input id="brand_name" name="brand_name" required defaultValue={defaultBrand} />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="title">Başlık *</Label>
            <Input id="title" name="title" required maxLength={255} placeholder="Ürün başlığı" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="description">Açıklama *</Label>
            <textarea
              id="description"
              name="description"
              required
              rows={4}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Ürün açıklaması"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Kategori Özellikleri (zorunlu)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="form_value_id">Form *</Label>
            <select
              id="form_value_id"
              name="form_value_id"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Seçin…</option>
              {formValues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="aroma_value_id">Aroma *</Label>
            <select
              id="aroma_value_id"
              name="aroma_value_id"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Seçin…</option>
              {aromaValues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Fiyat, Stok & Kargo</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="list_price">Liste Fiyatı (₺) *</Label>
            <Input id="list_price" name="list_price" type="number" step="0.01" min="0.01" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sale_price">Satış Fiyatı (₺) *</Label>
            <Input id="sale_price" name="sale_price" type="number" step="0.01" min="0.01" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="vat_rate">KDV (%) *</Label>
            <Input id="vat_rate" name="vat_rate" type="number" min="0" max="40" required defaultValue={10} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="quantity">Stok Adedi *</Label>
            <Input id="quantity" name="quantity" type="number" min="0" required defaultValue={0} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dimensional_weight">Desi/Ağırlık *</Label>
            <Input id="dimensional_weight" name="dimensional_weight" type="number" step="0.1" min="0" required defaultValue={1} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cargo_company_id">Kargo Firması *</Label>
            <select
              id="cargo_company_id"
              name="cargo_company_id"
              required
              defaultValue={10}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {CARGO_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Görseller *</h2>
        <p className="text-xs text-muted-foreground">
          1–8 görsel. Trendyol kuralı: min ~1200×1800 px, beyaz zemin, üzerinde
          yazı/logo/fiyat olmamalı. İlk görsel ana görsel olur.
        </p>
        <Input
          name="images"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          required
        />
      </section>

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          ✓ {state.success}
        </p>
      ) : null}

      <SubmitButton pendingLabel="Trendyol'a gönderiliyor…">
        Trendyol&apos;a Yayınla
      </SubmitButton>
    </form>
  );
}
