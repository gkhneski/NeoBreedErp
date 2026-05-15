"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { createCompany, type CompanyFormState } from "../actions";

const initialState: CompanyFormState = {};

interface CompanyFormProps {
  packages: Array<{ id: string; name: string }>;
}

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

export function CompanyForm({ packages }: CompanyFormProps) {
  const [state, formAction] = useFormState(createCompany, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Firma Adı *</Label>
          <Input id="name" name="name" required />
          <FieldError message={state.fieldErrors?.name} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tax_number">Vergi Numarası</Label>
          <Input id="tax_number" name="tax_number" />
          <FieldError message={state.fieldErrors?.tax_number} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact_name">Yetkili Kişi</Label>
          <Input id="contact_name" name="contact_name" />
          <FieldError message={state.fieldErrors?.contact_name} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact_email">Yetkili E-posta</Label>
          <Input
            id="contact_email"
            name="contact_email"
            type="email"
            placeholder="yetkili@firma.com"
          />
          <FieldError message={state.fieldErrors?.contact_email} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact_phone">Telefon</Label>
          <Input id="contact_phone" name="contact_phone" />
          <FieldError message={state.fieldErrors?.contact_phone} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="package_id">Paket</Label>
          <select
            id="package_id"
            name="package_id"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            defaultValue=""
          >
            <option value="">— Paket seçilmedi —</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="address">Adres</Label>
        <Textarea id="address" name="address" rows={3} />
        <FieldError message={state.fieldErrors?.address} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="status">Durum</Label>
        <select
          id="status"
          name="status"
          className="flex h-9 w-full max-w-[14rem] rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          defaultValue="active"
        >
          <option value="active">Aktif</option>
          <option value="suspended">Askıda</option>
          <option value="archived">Arşivli</option>
        </select>
      </div>

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <SubmitButton />
        <Link href="/superadmin/companies">
          <Button type="button" variant="outline">
            İptal
          </Button>
        </Link>
      </div>
    </form>
  );
}
