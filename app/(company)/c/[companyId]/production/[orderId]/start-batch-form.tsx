"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  startProductionOrder,
  type StartProductionOrderState,
} from "../actions";

const initialState: StartProductionOrderState = {};

interface StartBatchFormProps {
  companyId: string;
  orderId: string;
  defaultBatchNumber: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Başlatılıyor..." : "Üretime Al"}
    </Button>
  );
}

export function StartBatchForm({
  companyId,
  orderId,
  defaultBatchNumber,
}: StartBatchFormProps) {
  const [state, formAction] = useActionState(
    startProductionOrder.bind(null, companyId),
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="order_id" value={orderId} />

      <div className="space-y-1.5">
        <Label htmlFor="batch_number">Parti Numarası</Label>
        <Input
          id="batch_number"
          name="batch_number"
          required
          defaultValue={defaultBatchNumber}
          className="w-56"
          placeholder="BATCH-000001"
        />
        {state.fieldErrors?.batch_number ? (
          <p className="text-xs text-destructive">
            {state.fieldErrors.batch_number}
          </p>
        ) : null}
      </div>

      <SubmitButton />

      {state.error ? (
        <p className="basis-full rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
