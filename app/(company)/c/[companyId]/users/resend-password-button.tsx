"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { resendWelcomeEmail, type ResendPasswordState } from "./actions";

interface Props {
  companyId: string;
  userId: string;
}

const initialState: ResendPasswordState = {};

export function ResendPasswordButton({ companyId, userId }: Props) {
  const boundAction = resendWelcomeEmail.bind(null, companyId, userId);
  const [state, formAction, isPending] = useActionState(
    boundAction,
    initialState,
  );

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          {isPending ? "Gönderiliyor…" : "Şifre Linki Gönder"}
        </Button>
      </form>
      {state.error && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}
      {state.success && (
        <p className="text-xs text-green-600">{state.success}</p>
      )}
    </div>
  );
}
