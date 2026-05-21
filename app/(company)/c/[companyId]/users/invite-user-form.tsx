"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COMPANY_ROLE_LABELS, COMPANY_ROLE_VALUES } from "@/types/roles";

import {
  inviteCompanyUser,
  type CompanyInviteState,
} from "./actions";

const initialState: CompanyInviteState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Gönderiliyor..." : "Davet Gönder"}
    </Button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function InviteUserForm({ companyId }: { companyId: string }) {
  const [state, formAction] = useActionState(
    inviteCompanyUser.bind(null, companyId),
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4 rounded-md border border-border bg-card/40 p-4"
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
        <div className="space-y-1.5">
          <Label htmlFor="invite_email">E-posta *</Label>
          <Input
            id="invite_email"
            name="email"
            type="email"
            required
            placeholder="kullanici@firma.com"
          />
          <FieldError message={state.fieldErrors?.email} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="invite_role">Rol</Label>
          <select
            id="invite_role"
            name="role"
            defaultValue="viewer"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {COMPANY_ROLE_VALUES.filter((role) => role !== "company_user").map(
              (role) => (
                <option key={role} value={role}>
                  {COMPANY_ROLE_LABELS[role]}
                </option>
              ),
            )}
          </select>
          <FieldError message={state.fieldErrors?.role} />
        </div>
      </div>

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
          {state.success}
        </p>
      ) : null}

      <div>
        <SubmitButton />
      </div>

      <p className="text-xs text-muted-foreground">
        Kullanıcıya Supabase Auth davet e-postası gider. E-posta zaten
        kayıtlıysa sadece bu firmaya üyeliği eklenir.
      </p>
    </form>
  );
}
