"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  saveMarketplaceConnection,
  testMarketplaceConnection,
  type ConnectionFormState,
} from "./actions";

const initialState: ConnectionFormState = {};

function StateBanner({ state }: { state: ConnectionFormState }) {
  if (state.error) {
    return (
      <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
        ✓ {state.success}
      </p>
    );
  }
  return null;
}

export function ConnectionForm({
  companyId,
  channel,
  initial,
}: {
  companyId: string;
  channel: "trendyol" | "hepsiburada";
  initial: {
    seller_id: string;
    api_key_hint: string | null;
    api_secret_hint: string | null;
    enabled: boolean;
  } | null;
}) {
  const [saveState, saveAction] = useActionState(
    saveMarketplaceConnection,
    initialState,
  );
  const [testState, testAction] = useActionState(
    testMarketplaceConnection,
    initialState,
  );

  return (
    <div className="space-y-3">
      <form action={saveAction} className="space-y-4">
        <input type="hidden" name="company_id" value={companyId} />
        <input type="hidden" name="channel" value={channel} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${channel}-seller_id`}>Satıcı ID *</Label>
            <Input
              id={`${channel}-seller_id`}
              name="seller_id"
              required
              placeholder="örn. 123456"
              defaultValue={initial?.seller_id ?? ""}
            />
            {saveState.fieldErrors?.seller_id ? (
              <p className="text-xs text-destructive">
                {saveState.fieldErrors.seller_id}
              </p>
            ) : null}
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={initial?.enabled ?? true}
              />
              Bağlantı aktif
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${channel}-api_key`}>API Anahtarı *</Label>
            <Input
              id={`${channel}-api_key`}
              name="api_key"
              type="password"
              autoComplete="off"
              placeholder={
                initial?.api_key_hint
                  ? `Kayıtlı: ${initial.api_key_hint} (değiştirmek için yazın)`
                  : "Trendyol API anahtarı"
              }
            />
            {saveState.fieldErrors?.api_key ? (
              <p className="text-xs text-destructive">
                {saveState.fieldErrors.api_key}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${channel}-api_secret`}>Gizli Anahtar *</Label>
            <Input
              id={`${channel}-api_secret`}
              name="api_secret"
              type="password"
              autoComplete="off"
              placeholder={
                initial?.api_secret_hint
                  ? `Kayıtlı: ${initial.api_secret_hint} (değiştirmek için yazın)`
                  : "Trendyol API gizli anahtarı"
              }
            />
            {saveState.fieldErrors?.api_secret ? (
              <p className="text-xs text-destructive">
                {saveState.fieldErrors.api_secret}
              </p>
            ) : null}
          </div>
        </div>

        <StateBanner state={saveState} />

        <SubmitButton pendingLabel="Kaydediliyor...">Kaydet</SubmitButton>
      </form>

      {initial ? (
        <form action={testAction} className="space-y-2">
          <input type="hidden" name="company_id" value={companyId} />
          <input type="hidden" name="channel" value={channel} />
          <StateBanner state={testState} />
          <SubmitButton variant="outline" pendingLabel="Test ediliyor...">
            Bağlantıyı Test Et
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
