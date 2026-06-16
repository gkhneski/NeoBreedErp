"use client";

import {
  Check,
  Clock,
  Copy,
  ImageOff,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { approvePriceEvent, dismissPriceEvent } from "./actions";
import {
  cosmoAutopilot,
  cosmoScan,
  type CosmoOpportunity,
} from "./cosmo-actions";

const tl = (n: number) =>
  `${Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ₺`;

function OpportunityCard({
  companyId,
  op,
  canApprove,
  onDone,
}: {
  companyId: string;
  op: CosmoOpportunity;
  canApprove: boolean;
  onDone: (eventId: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function publish() {
    setError(null);
    startTransition(async () => {
      const res = await approvePriceEvent(companyId, op.eventId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone(op.eventId);
      router.refresh();
    });
  }

  function skip() {
    setError(null);
    startTransition(async () => {
      const res = await dismissPriceEvent(companyId, op.eventId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone(op.eventId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-[0_2px_12px_-6px_rgba(0,0,0,0.12)] sm:flex-row sm:p-4">
      <div className="relative h-24 w-24 shrink-0 self-center overflow-hidden rounded-xl border border-border bg-secondary sm:self-start">
        {op.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={op.imageUrl}
            alt={op.productName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-7 w-7 text-muted-foreground" />
          </div>
        )}
        <span className="absolute left-1 top-1 rounded-full bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
          -%{op.percent}
        </span>
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold leading-snug">{op.productName}</p>
          {op.daysLeft !== null ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
              <Clock className="h-3 w-3" />
              SKT {op.daysLeft} gün
            </span>
          ) : null}
        </div>

        <div className="flex items-baseline gap-2 text-sm">
          <span className="font-bold text-emerald-600 dark:text-emerald-400">
            {tl(op.newPrice)}
          </span>
          <span className="text-muted-foreground line-through">
            {tl(op.oldPrice)}
          </span>
        </div>

        <div className="rounded-xl bg-secondary/50 p-2.5">
          <p className="text-xs font-medium">{op.headline}</p>
          <p className="mt-1 text-xs text-muted-foreground">{op.pitch}</p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(`${op.headline}\n${op.pitch}`)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
            }}
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:underline dark:text-emerald-400"
          >
            <Copy className="h-3 w-3" />
            {copied ? "Kopyalandı" : "Metni kopyala"}
          </button>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        {canApprove ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={publish}>
              <Check className="mr-1 h-4 w-4" />
              {pending ? "Yayınlanıyor..." : "Onayla & Yayınla"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={skip}
            >
              <X className="mr-1 h-4 w-4" />
              Geç
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Yayınlama yetkisi firma adminindedir.
          </p>
        )}
      </div>
    </div>
  );
}

export function CosmoPanel({
  companyId,
  canApprove,
}: {
  companyId: string;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [ops, setOps] = useState<CosmoOpportunity[] | null>(null);
  const [aiPowered, setAiPowered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [scanning, startScan] = useTransition();
  const [autoBusy, startAuto] = useTransition();

  function scan() {
    setError(null);
    setNote(null);
    startScan(async () => {
      const res = await cosmoScan(companyId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOps(res.opportunities);
      setAiPowered(res.aiPowered);
    });
  }

  function autopilot() {
    if (
      !window.confirm(
        "COSMO tüm SKT fırsatlarını otomatik onaylayıp Trendyol'a yayınlasın mı?",
      )
    ) {
      return;
    }
    setError(null);
    setNote(null);
    startAuto(async () => {
      const res = await cosmoAutopilot(companyId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNote(
        `Otopilot tamam: ${res.applied} ürün yayınlandı${
          res.failed > 0 ? `, ${res.failed} başarısız` : ""
        }.`,
      );
      setOps([]);
      router.refresh();
    });
  }

  const busy = scanning || autoBusy;

  return (
    <section className="overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-50 to-card shadow-[0_2px_16px_-8px_rgba(5,150,105,0.4)] dark:from-emerald-950/30">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-500/20 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-green-700 text-white shadow-sm">
            <Sparkles className="h-6 w-6" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold tracking-tight">COSMO</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  aiPowered
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {aiPowered ? "Claude destekli" : "Pazaryeri ajanı"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              SKT yaklaşan ürünleri bulur, indirimi ve metni hazırlar, tek tıkla
              yayınlar.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={scan}>
            <Sparkles className="mr-1.5 h-4 w-4" />
            {scanning ? "Taranıyor..." : "Fırsatları Tara"}
          </Button>
          {canApprove ? (
            <Button variant="outline" disabled={busy} onClick={autopilot}>
              <Zap className="mr-1.5 h-4 w-4" />
              {autoBusy ? "Otopilot çalışıyor..." : "Otopilot"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {note ? (
          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            {note}
          </p>
        ) : null}

        {ops === null ? (
          <p className="text-sm text-muted-foreground">
            COSMO&apos;yu çalıştırmak için <strong>Fırsatları Tara</strong>&apos;ya
            basın. SKT&apos;si yaklaşan ürünleri tarayıp indirim önerilerini ve
            kampanya metinlerini hazırlar.
          </p>
        ) : ops.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            🎉 Şu an aksiyon gerektiren SKT fırsatı yok. COSMO temiz görüyor.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              COSMO {ops.length} fırsat buldu — en acil olan en üstte.
            </p>
            <div className="space-y-3">
              {ops.map((op) => (
                <OpportunityCard
                  key={op.eventId}
                  companyId={companyId}
                  op={op}
                  canApprove={canApprove}
                  onDone={(id) =>
                    setOps((prev) =>
                      prev ? prev.filter((o) => o.eventId !== id) : prev,
                    )
                  }
                />
              ))}
            </div>
          </>
        )}

        {ops !== null && !aiPowered ? (
          <p className="text-[11px] text-muted-foreground">
            İpucu: <code>ANTHROPIC_API_KEY</code> tanımlanınca COSMO metinleri
            Claude ile yazılır; şimdilik akıllı şablon kullanılıyor.
          </p>
        ) : null}
      </div>
    </section>
  );
}
