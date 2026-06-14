"use client";

import { Fragment, useActionState, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  pushListingPrice,
  saveListingRule,
  type RuleFormState,
} from "./actions";

export type ListingRow = {
  id: string;
  barcode: string;
  stock_code: string | null;
  title: string | null;
  normal_sale_price: number;
  normal_list_price: number | null;
  discount_price: number | null;
  discount_threshold_days: number | null;
  sync_stock: boolean;
  current_price_state: "normal" | "discounted" | "unknown";
  sync_status: "never" | "pending" | "ok" | "failed";
  sync_error: string | null;
  last_synced_at: string | null;
  material_id: string;
  materials: { code: string; name: string; base_uom: string } | null;
  sellable_quantity: number;
};

const PRICE_STATE_LABEL: Record<ListingRow["current_price_state"], string> = {
  normal: "Normal Fiyat",
  discounted: "İndirimde",
  unknown: "Bilinmiyor",
};

const PRICE_STATE_VARIANT: Record<
  ListingRow["current_price_state"],
  "default" | "warning" | "secondary"
> = {
  normal: "default",
  discounted: "warning",
  unknown: "secondary",
};

const SYNC_LABEL: Record<ListingRow["sync_status"], string> = {
  never: "Hiç gönderilmedi",
  pending: "Gönderildi, bekleniyor",
  ok: "Senkron",
  failed: "Hata",
};

function formatPrice(n: number): string {
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const initialRuleState: RuleFormState = {};

function RuleEditor({
  companyId,
  listing,
  defaultThresholdDays,
  onDone,
}: {
  companyId: string;
  listing: ListingRow;
  defaultThresholdDays: number;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(saveListingRule, initialRuleState);

  return (
    <form action={formAction} className="space-y-3 bg-secondary/20 p-4">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="listing_id" value={listing.id} />

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor={`nsp-${listing.id}`} className="text-xs">
            Normal Satış Fiyatı (₺) *
          </Label>
          <Input
            id={`nsp-${listing.id}`}
            name="normal_sale_price"
            type="number"
            step="0.01"
            min="0.01"
            required
            defaultValue={listing.normal_sale_price}
          />
          {state.fieldErrors?.normal_sale_price ? (
            <p className="text-xs text-destructive">
              {state.fieldErrors.normal_sale_price}
            </p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`nlp-${listing.id}`} className="text-xs">
            Liste Fiyatı (₺)
          </Label>
          <Input
            id={`nlp-${listing.id}`}
            name="normal_list_price"
            type="number"
            step="0.01"
            min="0.01"
            defaultValue={listing.normal_list_price ?? ""}
          />
          {state.fieldErrors?.normal_list_price ? (
            <p className="text-xs text-destructive">
              {state.fieldErrors.normal_list_price}
            </p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`dp-${listing.id}`} className="text-xs">
            SKT İndirimli Fiyat (₺)
          </Label>
          <Input
            id={`dp-${listing.id}`}
            name="discount_price"
            type="number"
            step="0.01"
            min="0.01"
            defaultValue={listing.discount_price ?? ""}
            placeholder="Boş = kural yok"
          />
          {state.fieldErrors?.discount_price ? (
            <p className="text-xs text-destructive">
              {state.fieldErrors.discount_price}
            </p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`dt-${listing.id}`} className="text-xs">
            SKT Eşiği (gün)
          </Label>
          <Input
            id={`dt-${listing.id}`}
            name="discount_threshold_days"
            type="number"
            min="1"
            max="3650"
            defaultValue={listing.discount_threshold_days ?? ""}
            placeholder={`Varsayılan: ${defaultThresholdDays} gün`}
          />
          {state.fieldErrors?.discount_threshold_days ? (
            <p className="text-xs text-destructive">
              {state.fieldErrors.discount_threshold_days}
            </p>
          ) : null}
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          name="sync_stock"
          defaultChecked={listing.sync_stock}
        />
        Fiyatla birlikte stok da gönderilsin (satılabilir stok:{" "}
        {listing.sellable_quantity.toLocaleString("tr-TR")}{" "}
        {listing.materials?.base_uom ?? ""})
      </label>

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          ✓ {state.success}
        </p>
      ) : null}

      <div className="flex gap-2">
        <SubmitButton pendingLabel="Kaydediliyor...">Kaydet</SubmitButton>
        <Button type="button" variant="outline" onClick={onDone}>
          Kapat
        </Button>
      </div>
    </form>
  );
}

export function ListingsTable({
  companyId,
  rows,
  canManage,
  defaultThresholdDays,
}: {
  companyId: string;
  rows: ListingRow[];
  canManage: boolean;
  defaultThresholdDays: number;
}) {
  const router = useRouter();
  const [openRuleId, setOpenRuleId] = useState<string | null>(null);
  const [pushBusyId, setPushBusyId] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handlePush(listingId: string) {
    setPushBusyId(listingId);
    setPushError(null);
    startTransition(async () => {
      const result = await pushListingPrice(companyId, listingId);
      if (!result.ok) setPushError(result.error);
      setPushBusyId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {pushError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {pushError}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Ürün</th>
              <th className="px-3 py-2 text-left font-medium">Barkod</th>
              <th className="px-3 py-2 text-right font-medium">Normal Fiyat</th>
              <th className="px-3 py-2 text-right font-medium">SKT Kuralı</th>
              <th className="px-3 py-2 text-right font-medium">Stok</th>
              <th className="px-3 py-2 text-left font-medium">Fiyat Durumu</th>
              <th className="px-3 py-2 text-left font-medium">Senkron</th>
              {canManage ? (
                <th className="px-3 py-2 text-right font-medium">İşlem</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((listing) => (
              <Fragment key={listing.id}>
                <tr className="border-t border-border align-top">
                  <td className="max-w-xs px-3 py-2">
                    <p className="text-sm">
                      {listing.materials ? (
                        <>
                          <span className="font-mono text-xs">
                            {listing.materials.code}
                          </span>{" "}
                          — {listing.materials.name}
                        </>
                      ) : (
                        "—"
                      )}
                    </p>
                    {listing.title ? (
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {listing.title}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {listing.barcode}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {formatPrice(Number(listing.normal_sale_price))} ₺
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {listing.discount_price !== null ? (
                      <span className="font-mono">
                        {formatPrice(Number(listing.discount_price))} ₺
                        <span className="text-muted-foreground">
                          {" "}
                          (≤
                          {listing.discount_threshold_days ??
                            defaultThresholdDays}
                          g)
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Kural yok</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {listing.sellable_quantity.toLocaleString("tr-TR")}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={PRICE_STATE_VARIANT[listing.current_price_state]}
                    >
                      {PRICE_STATE_LABEL[listing.current_price_state]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span
                      className={
                        listing.sync_status === "failed"
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }
                      title={listing.sync_error ?? undefined}
                    >
                      {SYNC_LABEL[listing.sync_status]}
                    </span>
                    {listing.last_synced_at ? (
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(listing.last_synced_at).toLocaleString(
                          "tr-TR",
                        )}
                      </p>
                    ) : null}
                  </td>
                  {canManage ? (
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setOpenRuleId(
                              openRuleId === listing.id ? null : listing.id,
                            )
                          }
                        >
                          Kural
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pushBusyId === listing.id}
                          onClick={() => handlePush(listing.id)}
                        >
                          {pushBusyId === listing.id
                            ? "Gönderiliyor..."
                            : "Fiyatı Gönder"}
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
                {openRuleId === listing.id && canManage ? (
                  <tr className="border-t border-border">
                    <td colSpan={8} className="p-0">
                      <RuleEditor
                        companyId={companyId}
                        listing={listing}
                        defaultThresholdDays={defaultThresholdDays}
                        onDone={() => {
                          setOpenRuleId(null);
                          router.refresh();
                        }}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
