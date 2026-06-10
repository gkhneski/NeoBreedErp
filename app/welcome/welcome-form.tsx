"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { completeWelcome, type WelcomeFormState } from "./actions";

const initialState: WelcomeFormState = {};

interface WelcomeFormProps {
  email: string;
  defaultFullName: string | null;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function WelcomeForm({ email, defaultFullName }: WelcomeFormProps) {
  const [state, formAction] = useActionState(completeWelcome, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <Label>E-posta</Label>
        <Input value={email} disabled readOnly />
        <p className="text-xs text-muted-foreground">
          Davet bu adrese gönderildi. Değiştirmek için yöneticinize ulaşın.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="full_name">Ad Soyad</Label>
        <Input
          id="full_name"
          name="full_name"
          defaultValue={defaultFullName ?? ""}
          placeholder="Ör. Eray Çalışkan"
        />
        <FieldError message={state.fieldErrors?.full_name} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Yeni Şifre *</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={10}
        />
        <p className="text-xs text-muted-foreground">
          En az 10 karakter olmalı.
        </p>
        <FieldError message={state.fieldErrors?.password} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm">Şifreyi Doğrula *</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
        />
        <FieldError message={state.fieldErrors?.confirm} />
      </div>

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}

      <SubmitButton>Hesabı Etkinleştir</SubmitButton>
    </form>
  );
}
