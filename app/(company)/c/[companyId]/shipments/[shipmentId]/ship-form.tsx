"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";

import { shipShipment, type ShipActionState } from "../actions";

const initialState: ShipActionState = {};

export function ShipForm({
  companyId,
  shipmentId,
  disabled,
}: {
  companyId: string;
  shipmentId: string;
  disabled: boolean;
}) {
  const [state, formAction] = useActionState(shipShipment, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="shipment_id" value={shipmentId} />
      <SubmitButton pendingLabel="Gönderiliyor..." disabled={disabled}>
        Gönderildi Olarak İşaretle
      </SubmitButton>
      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
