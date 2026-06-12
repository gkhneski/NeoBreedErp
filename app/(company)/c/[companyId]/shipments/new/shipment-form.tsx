"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ShipmentChannel } from "@/types/database";
import { companyModulePath } from "@/types/roles";

import { createShipment, type ShipmentFormState } from "../actions";

const initialState: ShipmentFormState = {};

interface CustomerOption {
  id: string;
  code: string;
  name: string;
}

const CHANNELS: Array<{ value: ShipmentChannel; label: string }> = [
  { value: "ecza", label: "Ecza Deposu" },
  { value: "trendyol", label: "Trendyol" },
  { value: "hepsiburada", label: "Hepsiburada" },
  { value: "diger", label: "Diğer" },
];

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function ShipmentForm({
  companyId,
  customers,
}: {
  companyId: string;
  customers: CustomerOption[];
}) {
  const [state, formAction] = useActionState(createShipment, initialState);
  const [channel, setChannel] = useState<ShipmentChannel>("ecza");
  const cancelHref = companyModulePath(companyId, "shipments");
  const isMarketplace = channel !== "ecza";

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="company_id" value={companyId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="channel">Kanal *</Label>
          <select
            id="channel"
            name="channel"
            required
            value={channel}
            onChange={(e) => setChannel(e.target.value as ShipmentChannel)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <FieldError message={state.fieldErrors?.channel} />
        </div>

        {channel === "ecza" ? (
          <div className="space-y-1.5">
            <Label htmlFor="customer_id">Ecza Deposu (Müşteri) *</Label>
            <select
              id="customer_id"
              name="customer_id"
              required
              defaultValue=""
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="" disabled>
                — Seçiniz —
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors?.customer_id} />
            {customers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Henüz müşteri kartı yok; firma admini Müşteriler modülünden
                eklemeli.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="external_order_no">
              Pazaryeri Sipariş No {isMarketplace ? "*" : ""}
            </Label>
            <Input
              id="external_order_no"
              name="external_order_no"
              required={isMarketplace && channel !== "diger"}
              placeholder="pazaryeri panelindeki sipariş numarası"
            />
            <FieldError message={state.fieldErrors?.external_order_no} />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="recipient">Alıcı Adı</Label>
          <Input
            id="recipient"
            name="recipient"
            placeholder={
              channel === "ecza" ? "opsiyonel" : "siparişteki alıcı adı"
            }
          />
          <FieldError message={state.fieldErrors?.recipient} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="carrier">Kargo Firması</Label>
          <Input id="carrier" name="carrier" placeholder="opsiyonel" />
          <FieldError message={state.fieldErrors?.carrier} />
        </div>
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
        <SubmitButton pendingLabel="Oluşturuluyor...">
          Siparişi Aç
        </SubmitButton>
        <Link href={cancelHref}>
          <Button type="button" variant="outline">
            İptal
          </Button>
        </Link>
      </div>
    </form>
  );
}
