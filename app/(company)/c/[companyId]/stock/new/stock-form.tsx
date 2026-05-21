"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { companyModulePath } from "@/types/roles";

import { recordStockMovement, type StockMovementFormState } from "../actions";

const initialState: StockMovementFormState = {};

interface LotOption {
  id: string;
  lot_number: string;
  quantity_on_hand: number;
  status: "quarantine" | "released" | "blocked";
  materials: { code: string; name: string; base_uom: string } | null;
}

const STATUS_LABEL: Record<LotOption["status"], string> = {
  quarantine: "Karantina",
  released: "Serbest",
  blocked: "Bloklu",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Kaydediliyor..." : "Kaydet"}
    </Button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function StockMovementForm({
  companyId,
  lots,
}: {
  companyId: string;
  lots: LotOption[];
}) {
  const [state, formAction] = useActionState(recordStockMovement, initialState);
  const [kind, setKind] = useState<"issue" | "adjustment">("issue");
  const [lotId, setLotId] = useState<string>("");
  const cancelHref = companyModulePath(companyId, "stock");

  const selected = useMemo(
    () => lots.find((l) => l.id === lotId),
    [lots, lotId],
  );

  const eligibleLots = useMemo(
    () =>
      kind === "issue"
        ? lots.filter((l) => l.status === "released" && Number(l.quantity_on_hand) > 0)
        : lots,
    [lots, kind],
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="company_id" value={companyId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="kind">Hareket Türü *</Label>
          <select
            id="kind"
            name="kind"
            required
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as "issue" | "adjustment");
              setLotId("");
            }}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="issue">Çıkış (issue)</option>
            <option value="adjustment">Sayım Düzeltmesi (adjustment)</option>
          </select>
          <FieldError message={state.fieldErrors?.kind} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="occurred_at">Tarih / Saat</Label>
          <Input id="occurred_at" name="occurred_at" type="datetime-local" />
          <FieldError message={state.fieldErrors?.occurred_at} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="lot_id">Lot *</Label>
          <select
            id="lot_id"
            name="lot_id"
            required
            value={lotId}
            onChange={(e) => setLotId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="" disabled>
              — Seçiniz —
            </option>
            {eligibleLots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.lot_number} — {l.materials?.code} {l.materials?.name} (
                {Number(l.quantity_on_hand)} {l.materials?.base_uom},{" "}
                {STATUS_LABEL[l.status]})
              </option>
            ))}
          </select>
          {kind === "issue" && eligibleLots.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Çıkış yapılabilecek lot yok. Bir lotu önce &quot;Serbest&quot;e alın ve
              eldeki miktarın {">"} 0 olduğundan emin olun.
            </p>
          ) : null}
          <FieldError message={state.fieldErrors?.lot_id} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="quantity">
            Miktar *{" "}
            {selected?.materials ? (
              <span className="text-muted-foreground">
                ({selected.materials.base_uom})
              </span>
            ) : null}
          </Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            step="0.000001"
            min="0"
            required
            placeholder="örn. 1.500000"
          />
          {selected ? (
            <p className="text-xs text-muted-foreground">
              Lotun eldeki miktarı:{" "}
              <span className="font-mono">
                {Number(selected.quantity_on_hand)}{" "}
                {selected.materials?.base_uom ?? ""}
              </span>
            </p>
          ) : null}
          <FieldError message={state.fieldErrors?.quantity} />
        </div>

        {kind === "adjustment" ? (
          <div className="space-y-1.5">
            <Label htmlFor="direction">Yön *</Label>
            <select
              id="direction"
              name="direction"
              defaultValue=""
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="" disabled>
                — Seçiniz —
              </option>
              <option value="in">+ Eklenecek</option>
              <option value="out">− Düşülecek</option>
            </select>
            <FieldError message={state.fieldErrors?.direction} />
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reason">
          Sebep {kind === "adjustment" ? "*" : ""}
        </Label>
        <Input
          id="reason"
          name="reason"
          placeholder={
            kind === "adjustment"
              ? "örn. Fiziki sayım farkı"
              : "örn. Üretim emri PO-2026-001"
          }
          required={kind === "adjustment"}
        />
        <FieldError message={state.fieldErrors?.reason} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notlar</Label>
        <Textarea id="notes" name="notes" rows={2} />
        <FieldError message={state.fieldErrors?.notes} />
      </div>

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
