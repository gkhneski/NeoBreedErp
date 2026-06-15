"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { saveListingMappings } from "../actions";

export type RemoteRow = {
  barcode: string;
  title: string;
  stockCode: string | null;
  salePrice: number;
  listPrice: number;
  quantity: number;
  approved: boolean;
  onSale: boolean;
  imageUrl: string | null;
  mapped: { listing_id: string; material_label: string } | null;
};

type MaterialOption = { id: string; code: string; name: string };

function formatPrice(n: number): string {
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function ImportMapper({
  companyId,
  rows,
  materials,
}: {
  companyId: string;
  rows: RemoteRow[];
  materials: MaterialOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const selectedCount = Object.values(selections).filter(Boolean).length;
  const unmappedCount = rows.filter((r) => !r.mapped).length;

  function handleSave() {
    const mappings = rows
      .filter((r) => !r.mapped && selections[r.barcode])
      .map((r) => ({
        material_id: selections[r.barcode],
        barcode: r.barcode,
        stock_code: r.stockCode,
        title: r.title || null,
        sale_price: r.salePrice,
        list_price: r.listPrice > 0 ? r.listPrice : null,
      }));

    if (mappings.length === 0) {
      setMessage({ kind: "error", text: "Önce en az bir ürün eşleştirin." });
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await saveListingMappings(companyId, mappings);
      if (result.error) {
        setMessage({ kind: "error", text: result.error });
      } else {
        setMessage({ kind: "success", text: result.success ?? "Kaydedildi." });
        setSelections({});
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.length} ürün bulundu · {unmappedCount} eşleşmemiş
        </p>
        <Button onClick={handleSave} disabled={pending || selectedCount === 0}>
          {pending
            ? "Kaydediliyor..."
            : `Seçilenleri Eşleştir (${selectedCount})`}
        </Button>
      </div>

      {message ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            message.kind === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200"
              : "border-destructive/30 bg-destructive/5 text-destructive"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Görsel</th>
              <th className="px-3 py-2 text-left font-medium">Barkod</th>
              <th className="px-3 py-2 text-left font-medium">Trendyol Ürünü</th>
              <th className="px-3 py-2 text-right font-medium">Fiyat</th>
              <th className="px-3 py-2 text-right font-medium">Stok</th>
              <th className="px-3 py-2 text-left font-medium">Durum</th>
              <th className="px-3 py-2 text-left font-medium">ERP Ürünü</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.barcode} className="border-t border-border align-top">
                <td className="px-3 py-2">
                  <div className="h-12 w-12 overflow-hidden rounded border border-border bg-secondary">
                    {row.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.imageUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{row.barcode}</td>
                <td className="max-w-sm px-3 py-2 text-xs">
                  <span className="line-clamp-2">{row.title || "—"}</span>
                  {row.stockCode ? (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {row.stockCode}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {formatPrice(row.salePrice)} ₺
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {row.quantity}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {row.approved ? (
                      <Badge variant="success">Onaylı</Badge>
                    ) : (
                      <Badge variant="warning">Onay Bekliyor</Badge>
                    )}
                    {row.onSale ? null : (
                      <Badge variant="secondary">Satışta Değil</Badge>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {row.mapped ? (
                    <span className="text-xs text-muted-foreground">
                      ✓ {row.mapped.material_label}
                    </span>
                  ) : (
                    <select
                      value={selections[row.barcode] ?? ""}
                      onChange={(e) =>
                        setSelections((prev) => ({
                          ...prev,
                          [row.barcode]: e.target.value,
                        }))
                      }
                      className="h-8 w-full min-w-[12rem] rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">— Eşleştirme yok —</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.code} — {m.name}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  Henüz ürün çekilmedi. Yukarıdan &quot;Yenile&quot;ye basın.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
