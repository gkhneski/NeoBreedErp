"use client";

import { useActionState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { inviteBuyer, revokeBuyer, type BuyerInviteState } from "./actions";

export type CustomerOption = { id: string; label: string };
export type BuyerAccount = {
  userId: string;
  email: string;
  customerName: string;
};

function RevokeButton({
  companyId,
  userId,
}: {
  companyId: string;
  userId: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Bu alıcı hesabının portal erişimi kapatılsın mı?")) return;
        start(async () => {
          await revokeBuyer(companyId, userId);
        });
      }}
    >
      {pending ? "..." : "Erişimi kapat"}
    </Button>
  );
}

export function BuyersAdmin({
  companyId,
  customers,
  accounts,
  canManage,
}: {
  companyId: string;
  customers: CustomerOption[];
  accounts: BuyerAccount[];
  canManage: boolean;
}) {
  const action = inviteBuyer.bind(null, companyId);
  const [state, formAction, pending] = useActionState<BuyerInviteState, FormData>(
    action,
    {},
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      {canManage ? (
        <form
          action={formAction}
          className="space-y-3 rounded-2xl border border-border bg-card p-4"
        >
          <h2 className="text-sm font-semibold">Yeni portal hesabı</h2>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Müşteri (eczane/depo)</label>
            <select
              name="customer_id"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              defaultValue=""
            >
              <option value="" disabled>
                Seçin…
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            {state.fieldErrors?.customer_id ? (
              <p className="text-[11px] text-destructive">{state.fieldErrors.customer_id}</p>
            ) : null}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">E-posta</label>
            <input
              name="email"
              type="email"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              placeholder="eczane@ornek.com"
            />
            {state.fieldErrors?.email ? (
              <p className="text-[11px] text-destructive">{state.fieldErrors.email}</p>
            ) : null}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Geçici şifre</label>
            <input
              name="password"
              type="text"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              placeholder="en az 8 karakter"
            />
            {state.fieldErrors?.password ? (
              <p className="text-[11px] text-destructive">{state.fieldErrors.password}</p>
            ) : null}
          </div>

          {state.error ? (
            <p className="text-xs text-destructive">{state.error}</p>
          ) : null}
          {state.success ? (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">{state.success}</p>
          ) : null}

          <Button type="submit" disabled={pending}>
            {pending ? "Oluşturuluyor..." : "Hesap oluştur"}
          </Button>
        </form>
      ) : (
        <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Yeni hesap açma yetkisi firma adminindedir.
        </p>
      )}

      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">
          Mevcut hesaplar ({accounts.length})
        </h2>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Henüz portal hesabı yok.</p>
        ) : (
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li
                key={a.userId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{a.customerName}</p>
                  <p className="text-xs text-muted-foreground">{a.email}</p>
                </div>
                {canManage ? (
                  <RevokeButton companyId={companyId} userId={a.userId} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
