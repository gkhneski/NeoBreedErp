"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

import { signQualityCheck, type SignQualityCheckState } from "../actions";

interface SignFormProps {
  companyId: string;
  checkId: string;
}

const initialState: SignQualityCheckState = {};

function SignButton({
  verdict,
  variant,
}: {
  verdict: "passed" | "failed";
  variant: "default" | "destructive";
}) {
  const { pending } = useFormStatus();
  const labels = {
    passed: { idle: "Geçti olarak İmzala", busy: "İmzalanıyor..." },
    failed: { idle: "Kaldı olarak İmzala", busy: "İmzalanıyor..." },
  } as const;
  return (
    <Button
      type="submit"
      name="overall_verdict"
      value={verdict}
      variant={variant}
      disabled={pending}
    >
      {pending ? labels[verdict].busy : labels[verdict].idle}
    </Button>
  );
}

export function SignForm({ companyId, checkId }: SignFormProps) {
  const [state, formAction] = useActionState(
    signQualityCheck.bind(null, companyId),
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="check_id" value={checkId} />

      <div className="rounded-md border border-border bg-card/40 p-4">
        <h2 className="text-sm font-semibold">İmza</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Geçti olarak imzalandığında konunun lotu &quot;Serbest&quot;e alınır
          ve üretim partisi söz konusuysa parti kapatılır. Kaldı olarak
          imzalandığında lot &quot;Bloklu&quot;ya alınır. İmza sonrası sonuçlar
          değiştirilemez.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <SignButton verdict="passed" variant="default" />
          <SignButton verdict="failed" variant="destructive" />
        </div>
        {state.error ? (
          <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
