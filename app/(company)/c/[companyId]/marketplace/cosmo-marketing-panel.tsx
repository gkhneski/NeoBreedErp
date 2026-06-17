"use client";

import {
  BadgeCheck,
  BarChart3,
  Check,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  ImageOff,
  LineChart,
  Megaphone,
  PenLine,
  Search,
  Send,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import type { CompetitorResearch } from "@/lib/marketplaces/cosmo-marketing";

import {
  cosmoCompetitorResearch,
  cosmoMarketingScan,
  cosmoVisibility,
  proposeMarketingPrice,
  pushListingContent,
  refreshContentStatus,
  type CosmoMarketingProduct,
  type VisibilityCheck,
} from "./cosmo-marketing-actions";
import type { VisibilityReport } from "@/lib/marketplaces/cosmo-marketing";

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

function ProposePriceButton({
  companyId,
  listingId,
  salePrice,
  label,
}: {
  companyId: string;
  listingId: string;
  salePrice: number;
  label: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [price, setPrice] = useState<string>(String(salePrice));
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const edited = price.trim() !== String(salePrice);
  function propose() {
    const value = Number(price.replace(",", ".").trim());
    if (!Number.isFinite(value) || value <= 0) {
      setMsg({ kind: "err", text: "Geçerli bir satış fiyatı girin." });
      return;
    }
    setMsg(null);
    start(async () => {
      const res = await proposeMarketingPrice(companyId, listingId, value);
      if (!res.ok) {
        setMsg({ kind: "err", text: res.error });
        return;
      }
      setMsg({
        kind: "ok",
        text: "Onay kuyruğuna eklendi. Bekleyen Fiyat Onayları'ndan yayınlayın.",
      });
      router.refresh();
    });
  }
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-28 rounded-md border border-border bg-card py-1.5 pl-2.5 pr-6 text-sm font-semibold tabular-nums focus:border-emerald-500 focus:outline-none"
            aria-label="Satış fiyatı"
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            ₺
          </span>
        </div>
        <Button size="sm" disabled={pending} onClick={propose}>
          <Check className="mr-1 h-4 w-4" />
          {pending ? "Ekleniyor..." : label}
        </Button>
        {edited ? (
          <button
            type="button"
            onClick={() => setPrice(String(salePrice))}
            className="text-[11px] text-muted-foreground hover:underline"
          >
            ↺ COSMO önerisi
          </button>
        ) : null}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Fiyatı dilediğin gibi değiştirip onay kuyruğuna ekleyebilirsin.
      </p>
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
    </div>
  );
}

function SendContentButton({
  companyId,
  listingId,
  title,
  description,
}: {
  companyId: string;
  listingId: string;
  title: string;
  description: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const [batchId, setBatchId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState(title);
  const [editDesc, setEditDesc] = useState(description);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const dirty = editTitle !== title || editDesc !== description;

  function send() {
    const t = editTitle.trim();
    const d = editDesc.trim();
    if (t.length < 5) {
      setMsg({ kind: "err", text: "Başlık en az 5 karakter olmalı." });
      return;
    }
    if (t.length > 100) {
      setMsg({ kind: "err", text: "Başlık en fazla 100 karakter olabilir." });
      return;
    }
    if (d.length < 10) {
      setMsg({ kind: "err", text: "Açıklama en az 10 karakter olmalı." });
      return;
    }
    if (
      !window.confirm(
        "Düzenlediğin BAŞLIK ve AÇIKLAMA Trendyol'a gönderilecek.\n\n" +
          "• Trendyol içeriği YENİDEN ONAYA alır (anında yayına girmez).\n" +
          "• Fiyat ve stok DEĞİŞMEZ.\n\nDevam edilsin mi?",
      )
    ) {
      return;
    }
    setMsg(null);
    start(async () => {
      const res = await pushListingContent(companyId, listingId, t, d);
      if (!res.ok) {
        setMsg({ kind: "err", text: res.error });
        return;
      }
      setBatchId(res.batchRequestId);
      setMsg({
        kind: "ok",
        text: `Trendyol'a gönderildi (takip: ${res.batchRequestId}). Onaydan sonra yayına girer.`,
      });
      router.refresh();
    });
  }

  function refresh() {
    startRefresh(async () => {
      const res = await refreshContentStatus(companyId, listingId);
      if (!res.ok) {
        setMsg({ kind: "err", text: res.error });
        return;
      }
      if (res.status === "pending") {
        setMsg({ kind: "ok", text: "Trendyol hâlâ işliyor (onayda). Biraz sonra tekrar bakın." });
      } else if (res.status === "approved") {
        setMsg({ kind: "ok", text: "Trendyol kabul etti ✓ (içerik onay sürecine girdi)." });
      } else {
        setMsg({ kind: "err", text: `Trendyol reddetti: ${res.error ?? "bilinmeyen hata"}` });
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-400">
            Trendyol&apos;a gidecek başlık (düzenlenebilir)
          </label>
          <span
            className={`text-[10px] tabular-nums ${
              editTitle.length > 100 ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {editTitle.length}/100
          </span>
        </div>
        <input
          type="text"
          value={editTitle}
          maxLength={120}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium focus:border-emerald-500 focus:outline-none"
        />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-400">
          Trendyol&apos;a gidecek açıklama (düzenlenebilir)
        </label>
        <textarea
          value={editDesc}
          rows={5}
          onChange={(e) => setEditDesc(e.target.value)}
          className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xs leading-relaxed focus:border-emerald-500 focus:outline-none"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending} onClick={send}>
          <Send className="mr-1 h-4 w-4" />
          {pending ? "Gönderiliyor..." : "Başlık + açıklamayı Trendyol'a gönder"}
        </Button>
        {dirty ? (
          <button
            type="button"
            onClick={() => {
              setEditTitle(title);
              setEditDesc(description);
            }}
            className="text-[11px] text-muted-foreground hover:underline"
          >
            ↺ COSMO önerisi
          </button>
        ) : null}
        {batchId ? (
          <Button size="sm" variant="outline" disabled={refreshing} onClick={refresh}>
            {refreshing ? "..." : "Durumu yenile"}
          </Button>
        ) : null}
      </div>
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
    </div>
  );
}

function CompetitorBlock({
  companyId,
  product,
  canApprove,
}: {
  companyId: string;
  product: CosmoMarketingProduct;
  canApprove: boolean;
}) {
  const [research, setResearch] = useState<CompetitorResearch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run() {
    setError(null);
    start(async () => {
      const res = await cosmoCompetitorResearch(companyId, product.listingId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResearch(res.research);
    });
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Target className="h-3.5 w-3.5" /> Canlı Rakip Araştırması
        </h4>
        <Button size="sm" variant="outline" disabled={pending} onClick={run}>
          <Globe className="mr-1 h-4 w-4" />
          {pending
            ? "Trendyol taranıyor..."
            : research
              ? "Tekrar tara"
              : "Trendyol'da rakipleri araştır"}
        </Button>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {pending && !research ? (
        <p className="text-xs text-muted-foreground">
          COSMO Trendyol&apos;da karşılaştırılabilir ürünleri arıyor, gerçek
          fiyatları kaynaklarıyla topluyor… (10-30 sn)
        </p>
      ) : null}

      {research ? (
        <div className="space-y-3 rounded-xl border border-border bg-secondary/30 p-3">
          <p className="text-xs text-muted-foreground">{research.summary}</p>

          {research.findings.length > 0 ? (
            <div className="space-y-1.5">
              {research.findings.map((f, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-2 rounded-lg bg-card p-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{f.name}</p>
                    {f.note ? (
                      <p className="text-muted-foreground">{f.note}</p>
                    ) : null}
                    {f.url ? (
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-600 hover:underline dark:text-emerald-400"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Kaynak
                      </a>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-bold">
                    {f.price !== null ? tl(f.price) : "—"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Kaynaklı rakip fiyatı bulunamadı.
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {research.ourEdge.length > 0 ? (
              <div className="rounded-lg bg-emerald-500/10 p-2">
                <p className="mb-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  Bizim avantajımız
                </p>
                <ul className="list-inside list-disc space-y-0.5 text-[11px] text-muted-foreground">
                  {research.ourEdge.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {research.theirEdge.length > 0 ? (
              <div className="rounded-lg bg-rose-500/10 p-2">
                <p className="mb-1 text-[11px] font-semibold text-rose-700 dark:text-rose-400">
                  Rakiplerin iyi yaptığı
                </p>
                <ul className="list-inside list-disc space-y-0.5 text-[11px] text-muted-foreground">
                  {research.theirEdge.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-2.5">
            <div className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                Kanıta dayalı fiyat:
              </span>
              <span className="font-bold text-violet-700 dark:text-violet-400">
                {tl(research.recommendedSalePrice)}
              </span>
              <span className="text-muted-foreground line-through">
                {tl(research.recommendedListPrice)}
              </span>
            </div>
            {research.rationale ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {research.rationale}
              </p>
            ) : null}
            {canApprove ? (
              <div className="mt-2">
                <ProposePriceButton
                  companyId={companyId}
                  listingId={product.listingId}
                  salePrice={research.recommendedSalePrice}
                  label="Bu fiyatı onay kuyruğuna ekle"
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function VisibilityBlock({
  companyId,
  product,
}: {
  companyId: string;
  product: CosmoMarketingProduct;
}) {
  const [report, setReport] = useState<VisibilityReport | null>(null);
  const [checks, setChecks] = useState<VisibilityCheck[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run() {
    setError(null);
    start(async () => {
      const res = await cosmoVisibility(companyId, product.listingId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setReport(res.report);
      setChecks(res.checks);
    });
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Search className="h-3.5 w-3.5" /> Aramada Görünürlük
        </h4>
        <Button size="sm" variant="outline" disabled={pending} onClick={run}>
          <Search className="mr-1 h-4 w-4" />
          {pending
            ? "İnceleniyor..."
            : report
              ? "Tekrar incele"
              : "Aramada neden çıkmıyorum?"}
        </Button>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {pending && !report ? (
        <p className="text-xs text-muted-foreground">
          COSMO listingini denetliyor ve Trendyol&apos;da hedef kelimeleri arıyor… (10-30 sn)
        </p>
      ) : null}

      {report ? (
        <div className="space-y-3 rounded-xl border border-border bg-secondary/30 p-3">
          {/* Deterministik teşhis (bizim verimiz) */}
          <ul className="space-y-1">
            {checks.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                {c.ok ? (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                )}
                <span>
                  <span className="font-medium">{c.label}:</span>{" "}
                  <span className="text-muted-foreground">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>

          <p className="rounded-lg bg-card p-2 text-xs text-muted-foreground">
            {report.diagnosis}
          </p>

          {report.optimizedTitle ? (
            <div className="rounded-lg bg-card p-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-400">
                    Arama-odaklı başlık önerisi
                  </p>
                  <p className="text-xs font-medium">{report.optimizedTitle}</p>
                </div>
                <CopyButton text={report.optimizedTitle} label="Başlık" />
              </div>
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            {report.longTailKeywords.length > 0 ? (
              <div className="rounded-lg bg-emerald-500/10 p-2">
                <p className="mb-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  Şimdi kazanılabilir kelimeler
                </p>
                <div className="flex flex-wrap gap-1">
                  {report.longTailKeywords.map((k, i) => (
                    <span key={i} className="rounded-full bg-card px-2 py-0.5 text-[10px]">
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {report.headKeywords.length > 0 ? (
              <div className="rounded-lg bg-amber-500/10 p-2">
                <p className="mb-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  Reklam gerektiren kelimeler
                </p>
                <div className="flex flex-wrap gap-1">
                  {report.headKeywords.map((k, i) => (
                    <span key={i} className="rounded-full bg-card px-2 py-0.5 text-[10px]">
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {report.adsPlan ? (
            <div className="rounded-lg bg-card p-2">
              <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold">
                <Megaphone className="h-3.5 w-3.5" /> Reklam (Sponsorlu Ürün) planı
              </p>
              <p className="text-xs text-muted-foreground">{report.adsPlan}</p>
            </div>
          ) : null}

          {report.rankNote ? (
            <p className="text-[11px] text-muted-foreground">
              Sıra gözlemi (tahmini): {report.rankNote}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
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
  const [open, setOpen] = useState(false);
  const r = product.report;
  const titleChanged =
    (product.currentTitle ?? "").trim() !== r.title.trim();
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
              <ProposePriceButton
                companyId={companyId}
                listingId={product.listingId}
                salePrice={r.priceSalePrice}
                label="Önerilen fiyatı onay kuyruğuna ekle"
              />
            ) : null}
          </section>

          {/* Content: current vs suggested */}
          <section className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <PenLine className="h-3.5 w-3.5" /> İçerik
            </h4>
            <div className="space-y-2 rounded-xl bg-secondary/50 p-2.5">
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                  Mevcut başlık (Trendyol&apos;da yayında)
                </p>
                <p className="text-xs text-muted-foreground">
                  {product.currentTitle ?? "—"}
                </p>
              </div>
              {!canApprove ? (
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-400">
                      Önerilen başlık {titleChanged ? "" : "(aynı)"}
                    </p>
                    <CopyButton text={r.title} label="Başlık" />
                  </div>
                  <p className="text-xs font-medium">{r.title}</p>
                </div>
              ) : null}
            </div>
            {!canApprove ? (
              <div className="rounded-xl bg-secondary/50 p-2.5">
                <p className="text-xs text-muted-foreground">{r.description}</p>
                <div className="mt-1.5">
                  <CopyButton text={r.description} label="Açıklama" />
                </div>
              </div>
            ) : null}
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
            {canApprove ? (
              <div className="border-t border-border pt-2">
                <SendContentButton
                  companyId={companyId}
                  listingId={product.listingId}
                  title={r.title}
                  description={r.description}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Trendyol içeriği yeniden onaya alır; fiyat/stok değişmez.
                </p>
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

          {/* Search visibility */}
          <VisibilityBlock companyId={companyId} product={product} />

          {/* Live competitor research */}
          <CompetitorBlock
            companyId={companyId}
            product={product}
            canApprove={canApprove}
          />
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Fiyat, içerik, satış stratejisi, <strong>aramada görünürlük</strong> ve
          canlı Trendyol rakip analizi — ürün bazında.
        </p>
        <Button disabled={scanning} onClick={scan}>
          <Sparkles className="mr-1.5 h-4 w-4" />
          {scanning ? "Analiz ediliyor..." : "Pazarlama Analizi Üret"}
        </Button>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {products === null ? (
        <p className="text-sm text-muted-foreground">
          <strong>Pazarlama Analizi Üret</strong>&apos;e basın. COSMO her listingi
          gerçek verinizle (fiyat, stok, SKT, son 30 gün satış) inceleyip ürün
          bazlı fiyat, içerik ve strateji çıkarır. Detayda her ürün için{" "}
          <strong>&quot;Aramada neden çıkmıyorum?&quot;</strong> ve{" "}
          <strong>canlı rakip araştırması</strong> çalıştırabilirsiniz.
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
    </div>
  );
}
