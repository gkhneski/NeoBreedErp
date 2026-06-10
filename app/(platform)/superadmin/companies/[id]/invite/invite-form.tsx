"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COMPANY_ROLE_LABELS, COMPANY_ROLE_VALUES } from "@/types/roles";

import { inviteCompanyMember, type InviteFormState } from "./actions";

const initialState: InviteFormState = {};

interface InviteFormProps {
  companyId: string;
  companyName: string;
  defaultEmail?: string | null;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function InviteForm({
  companyId,
  companyName,
  defaultEmail,
}: InviteFormProps) {
  const [state, formAction] = useActionState(inviteCompanyMember, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="company_id" value={companyId} />

      <div className="space-y-1.5">
        <Label>Firma</Label>
        <Input value={companyName} disabled readOnly />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">E-posta *</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={defaultEmail ?? ""}
          placeholder="yetkili@firma.com"
        />
        <FieldError message={state.fieldErrors?.email} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="role">Rol</Label>
        <select
          id="role"
          name="role"
          defaultValue="company_admin"
          className="flex h-9 w-full max-w-[18rem] rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <SubmitButton pendingLabel="Gönderiliyor...">Daveti Gönder</SubmitButton>
        <Link href={`/superadmin/companies/${companyId}`}>
          <Button type="button" variant="outline">
            İptal
          </Button>
        </Link>
      </div>

      <p className="text-xs text-muted-foreground">
        Kullanıcıya bir davet e-postası gönderilir. Linke tıklayıp şifre belirlemesi
        gerekir. E-posta zaten kayıtlıysa, sadece firma üyeliği eklenir.
      </p>
    </form>
  );
}
