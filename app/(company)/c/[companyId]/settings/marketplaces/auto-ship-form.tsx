"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";

import { setAutoShip, type AutoShipFormState } from "./actions";

const initialState: AutoShipFormState = {};

export function AutoShipForm({
  companyId,
  channel,
  enabled,
  enabledAt,
  connected,
}: {
  companyId: string;
  channel: "trendyol" | "hepsiburada";
  enabled: boolean;
  enabledAt: string | null;
  connected: boolean;
}) {
  const [state, action] = useActionState(setAutoShip, initialState);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Açıkken pazaryeri bir siparişi <strong>kargoya verildi</strong> olarak
        bildirdiğinde ERP sevkiyatı kendisi açar, satış deposundaki serbest
        lotlardan en yakın SKT&apos;li olanı düşer ve sevkiyatı kapatır. Düşülemeyen
        siparişler Siparişler sayfasında istisna olarak listelenir. Depocunun
        aynı sipariş için elle açtığı sevkiyat varsa ikinci kez düşülmez.
      </p>

      {enabled && enabledAt ? (
        <p className="text-xs text-muted-foreground">
          Açılış: {new Date(enabledAt).toLocaleString("tr-TR")} — yalnızca bu
          andan sonraki siparişler düşülür.
        </p>
      ) : null}

      {state.needsConfirm ? (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <p className="font-semibold">
            Dikkat: {state.needsConfirm.count} listelenmiş ürünün satış deposunda
            satılabilir stoğu yok.
          </p>
          <p>
            Bu ürünlerin siparişleri &quot;yetersiz stok&quot; istisnasına düşer;
            depocu sayımı bitirip stoğu girince kendiliğinden düşülür. Sayım
            bitmeden açarsanız istisna sayısı yüksek olur.
          </p>
          <p className="max-h-32 overflow-y-auto font-mono text-[11px] leading-5">
            {state.needsConfirm.names.join(" · ")}
            {state.needsConfirm.count > state.needsConfirm.names.length
              ? ` · +${state.needsConfirm.count - state.needsConfirm.names.length} daha`
              : ""}
          </p>
          <form action={action} className="flex flex-wrap gap-2">
            <input type="hidden" name="company_id" value={companyId} />
            <input type="hidden" name="channel" value={channel} />
            <input type="hidden" name="enable" value="1" />
            <input type="hidden" name="confirm" value="1" />
            <SubmitButton pendingLabel="Açılıyor...">Yine de Aç</SubmitButton>
          </form>
        </div>
      ) : null}

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
          ✓ {state.success}
        </p>
      ) : null}

      {!state.needsConfirm ? (
        <form action={action}>
          <input type="hidden" name="company_id" value={companyId} />
          <input type="hidden" name="channel" value={channel} />
          <input type="hidden" name="enable" value={enabled ? "0" : "1"} />
          <SubmitButton
            pendingLabel="Kaydediliyor..."
            variant={enabled ? "outline" : "default"}
            disabled={!connected}
          >
            {enabled ? "Otomatik Sevkiyatı Kapat" : "Otomatik Sevkiyatı Aç"}
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
