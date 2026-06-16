"use client";

import {
  BadgeCheck,
  BarChart3,
  Check,
  ChevronDown,
  Clock,
  Copy,
  ImageOff,
  LineChart,
  PenLine,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import {
  cosmoMarketingScan,
  proposeMarketingPrice,
  type CosmoMarketingProduct,
} from "./cosmo-marketing-actions";

const tl = (n: number) =>
  `${Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ₺`;

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:underline dark:text-emerald-400"
    >
      <Copy className="h-3 w-3" />
      {copied ? "Kopyalandı" : label ?? "Kopyala"}
    </button>
  );
}

function scoreColor(score: number): string {
  if (score >= 75) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  if (score >= 50) return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-rose-500/15 text-rose-700 dark:text-rose-400";
}

function ProductCard({
  companyId,
  product,
  canApprove,
}: {
  companyId: string;
  product: CosmoMarketingProduct;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const r = product.report;

  function propose() {
    setMsg(null);
    start(async () => {
      const res = await proposeMarketingPrice(
        companyId,
        product.listingId,
        r.priceSalePrice,
      );
      if (!res.ok) {
        setMsg({ kind: "err", text: res.error });
        return;
      }
      setMsg({
        kind: "ok",
        text: "Önerilen fiyat onay kuyruğuna eklendi. Bekleyen Fiyat Onayları'ndan yayınlayın.",
      });
      router.refresh();
    });
  }

  const priceChanged = r.priceSalePrice !== product.salePrice;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-[0_2px_12px_-6px_rgba(0,0,0,0.12)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left sm:p-4"
      >
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border bg-secondary">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.productName}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageOff className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-semibold">{product.productName}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
              <BarChart3 className="h-3 w-3" />
              30g: {product.unitsSold30d} satış
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
              {product.stockUnits.toLocaleString("tr-TR")} stok
            </span>
            {product.daysToExpiry !== null ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-400">
                <Clock className="h-3 w-3" />
                SKT {product.daysToExpiry}g
              </span>
            ) : null}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${scoreColor(
                r.auditScore,
              )}`}
            >
              <BadgeCheck className="h-3 w-3" />
              Liste {r.auditScore}/100
            </span>
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <div className="space-y-4 border-t border-border p-3 sm:p-4">
          {/* Pricing */}
          <section className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Tag className="h-3.5 w-3.5" /> Fiyat Önerisi
            </h4>
            <div className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {tl(r.priceSalePrice)}
              </span>
              <span className="text-muted-foreground line-through">
                {tl(r.priceListPrice)}
              </span>
              {priceChanged ? (
                <span className="text-[11px] text-muted-foreground">
                  (mevcut {tl(product.salePrice)})
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{r.priceRationale}</p>
            {canApprove ? (
              <Button size="sm" disabled={pending} onClick={propose}>
                <Check className="mr-1 h-4 w-4" />
                {pending ? "Ekleniyor..." : "Önerilen fiyatı onay kuyruğuna ekle"}
              </Button>
            ) : null}
            {msg ? (
              <p
                className={`text-xs ${
                  msg.kind === "ok"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive"
                }`}
              >
                {msg.text}
              </p>
            ) : null}
          </section>

          {/* Content */}
          <section className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <PenLine className="h-3.5 w-3.5" /> İçerik
            </h4>
            <div className="rounded-xl bg-secondary/50 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium">{r.title}</p>
                <CopyButton text={r.title} label="Başlık" />
              </div>
            </div>
            <div className="rounded-xl bg-secondary/50 p-2.5">
              <p className="text-xs text-muted-foreground">{r.description}</p>
              <div className="mt-1.5">
                <CopyButton text={r.description} label="Açıklama" />
              </div>
            </div>
            {r.bullets.length > 0 ? (
              <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                {r.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            ) : null}
            {r.keywords.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                {r.keywords.map((k, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {k}
                  </span>
                ))}
                <CopyButton text={r.keywords.join(", ")} label="Kelimeler" />
              </div>
            ) : null}
          </section>

          {/* Strategy */}
          <section className="space-y-1.5">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" /> Satış Stratejisi
            </h4>
            <p className="text-xs text-muted-foreground">{r.strategy}</p>
          </section>

          {/* Audit */}
          {r.auditIssues.length > 0 ? (
            <section className="space-y-1.5">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <LineChart className="h-3.5 w-3.5" /> Listing Denetimi
              </h4>
              <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                {r.auditIssues.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Competitor */}
          <section className="space-y-1.5">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Target className="h-3.5 w-3.5" /> Rakip Konumu (tahmini)
            </h4>
            <p className="text-xs text-muted-foreground">{r.competitor}</p>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export function CosmoMarketingPanel({
  companyId,
  canApprove,
}: {
  companyId: string;
  canApprove: boolean;
}) {
  const [products, setProducts] = useState<CosmoMarketingProduct[] | null>(null);
  const [aiPowered, setAiPowered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, startScan] = useTransition();

  function scan() {
    setError(null);
    startScan(async () => {
      const res = await cosmoMarketingScan(companyId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setProducts(res.products);
      setAiPowered(res.aiPowered);
    });
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-violet-500/30 bg-gradient-to-br from-violet-50 to-card shadow-[0_2px_16px_-8px_rgba(124,58,237,0.4)] dark:from-violet-950/30">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-500/20 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-700 text-white shadow-sm">
            <Sparkles className="h-6 w-6" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold tracking-tight">
                COSMO Pazarlama
              </h2>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  aiPowered
                    ? "bg-violet-500/15 text-violet-700 dark:text-violet-400"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {aiPowered ? "Claude destekli" : "Pazarlama ajanı"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Her ürün için fiyat, içerik, satış stratejisi, listing denetimi ve
              rakip konumu üretir.
            </p>
          </div>
        </div>
        <Button disabled={scanning} onClick={scan}>
          <Sparkles className="mr-1.5 h-4 w-4" />
          {scanning ? "Analiz ediliyor..." : "Pazarlama Analizi Üret"}
        </Button>
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {products === null ? (
          <p className="text-sm text-muted-foreground">
            <strong>Pazarlama Analizi Üret</strong>&apos;e basın. COSMO her
            listingi gerçek verinizle (fiyat, stok, SKT, son 30 gün satış)
            inceleyip ürün bazlı fiyat, içerik ve strateji çıkarır.
          </p>
        ) : products.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            Henüz eşleştirilmiş Trendyol listingi yok. Önce
            &quot;Trendyol&apos;dan Listeleri Çek&quot; ile ürünleri eşleştirin.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              COSMO {products.length} ürünü analiz etti — detay için ürüne tıklayın.
            </p>
            <div className="space-y-2.5">
              {products.map((p) => (
                <ProductCard
                  key={p.listingId}
                  companyId={companyId}
                  product={p}
                  canApprove={canApprove}
                />
              ))}
            </div>
          </>
        )}

        {products !== null && !aiPowered ? (
          <p className="text-[11px] text-muted-foreground">
            İpucu: <code>ANTHROPIC_API_KEY</code> tanımlanınca analiz Claude ile
            yazılır; şimdilik akıllı şablon kullanılıyor.
          </p>
        ) : null}
        {products !== null && aiPowered ? (
          <p className="text-[11px] text-muted-foreground">
            Not: Rakip konumu, Trendyol satıcı API&apos;si rakip verisi vermediği
            için COSMO&apos;nun genel piyasa bilgisine dayalı <strong>tahminidir</strong>.
          </p>
        ) : null}
      </div>
    </section>
  );
}
