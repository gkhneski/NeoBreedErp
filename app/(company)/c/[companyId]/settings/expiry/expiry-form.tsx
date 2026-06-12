"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveExpirySettings, type ExpirySettingsState } from "./actions";

const initialState: ExpirySettingsState = {};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function ExpiryForm({
  companyId,
  criticalDays,
  warningDays,
}: {
  companyId: string;
  criticalDays: number;
  warningDays: number;
}) {
  const [state, formAction] = useActionState(saveExpirySettings, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="company_id" value={companyId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="expiry_critical_days">
            Acil Eşiği (gün) *{" "}
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500 align-middle" />
          </Label>
          <Input
            id="expiry_critical_days"
            name="expiry_critical_days"
            type="number"
            min="1"
            max="3650"
            required
            defaultValue={criticalDays}
          />
          <p className="text-xs text-muted-foreground">
            SKT bu kadar gün veya daha az kaldıysa lot &quot;Acil&quot; sayılır.
          </p>
          <FieldError message={state.fieldErrors?.expiry_critical_days} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="expiry_warning_days">
            Yaklaşan Eşiği (gün) *{" "}
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400 align-middle" />
          </Label>
          <Input
            id="expiry_warning_days"
            name="expiry_warning_days"
            type="number"
            min="1"
            max="3650"
            required
            defaultValue={warningDays}
          />
          <p className="text-xs text-muted-foreground">
            SKT bu kadar gün veya daha az kaldıysa lot &quot;Yaklaşan&quot;
            sayılır.
          </p>
          <FieldError message={state.fieldErrors?.expiry_warning_days} />
        </div>
      </div>

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}

      <SubmitButton pendingLabel="Kaydediliyor...">Kaydet</SubmitButton>
    </form>
  );
}
