"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { companyModulePath } from "@/types/roles";

import {
  createSupplier,
  updateSupplier,
  type SupplierFormState,
} from "../actions";

const initialState: SupplierFormState = {};

type SupplierInitial = {
  id: string;
  code: string;
  name: string;
  tax_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  country: string | null;
  notes: string | null;
};

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Kaydediliyor..." : editing ? "Güncelle" : "Kaydet"}
    </Button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function SupplierForm({
  companyId,
  initial,
}: {
  companyId: string;
  initial?: SupplierInitial;
}) {
  const [state, formAction] = useActionState(
    initial ? updateSupplier : createSupplier,
    initialState,
  );
  const cancelHref = companyModulePath(companyId, "suppliers");

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="company_id" value={companyId} />
      {initial ? <input type="hidden" name="supplier_id" value={initial.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Kod</Label>
          <Input value={initial?.code ?? "TED-01 otomatik"} disabled />
          {!initial ? (
            <p className="text-xs text-muted-foreground">
              Kod kayıt sirasinda otomatik verilir.
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Ad *</Label>
          <Input id="name" name="name" required defaultValue={initial?.name ?? ""} />
          <FieldError message={state.fieldErrors?.name} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tax_number">Vergi No</Label>
          <Input
            id="tax_number"
            name="tax_number"
            defaultValue={initial?.tax_number ?? ""}
          />
          <FieldError message={state.fieldErrors?.tax_number} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="country">Ülke (ISO-2)</Label>
          <Input
            id="country"
            name="country"
            maxLength={2}
            placeholder="TR"
            style={{ textTransform: "uppercase" }}
            defaultValue={initial?.country ?? ""}
          />
          <FieldError message={state.fieldErrors?.country} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-posta</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={initial?.email ?? ""}
          />
          <FieldError message={state.fieldErrors?.email} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Telefon</Label>
          <Input id="phone" name="phone" defaultValue={initial?.phone ?? ""} />
          <FieldError message={state.fieldErrors?.phone} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="address">Adres</Label>
        <Textarea
          id="address"
          name="address"
          rows={2}
          defaultValue={initial?.address ?? ""}
        />
        <FieldError message={state.fieldErrors?.address} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notlar</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={initial?.notes ?? ""} />
        <FieldError message={state.fieldErrors?.notes} />
      </div>

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <SubmitButton editing={!!initial} />
        <Link href={cancelHref}>
          <Button type="button" variant="outline">
            İptal
          </Button>
        </Link>
      </div>
    </form>
  );
}
