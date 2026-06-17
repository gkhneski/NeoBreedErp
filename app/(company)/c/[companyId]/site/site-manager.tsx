"use client";

import { ExternalLink, Globe, Megaphone, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  deleteArticle,
  deleteProductPage,
  generateArticleDraft,
  generateProductPageDraft,
  setArticleStatus,
  setProductPageStatus,
} from "./actions";

export type ProductRow = {
  materialId: string;
  name: string;
  barcode: string | null;
  page: {
    id: string;
    slug: string;
    seoTitle: string;
    status: "draft" | "published";
    price: number | null;
  } | null;
};

export type ArticleRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  status: "draft" | "published";
};

type Tab = "products" | "articles";

function StatusBadge({ status }: { status: "draft" | "published" | "none" }) {
  const map = {
    published: { label: "Yayında", cls: "bg-emerald-100 text-emerald-700" },
    draft: { label: "Taslak", cls: "bg-amber-100 text-amber-700" },
    none: { label: "Yok", cls: "bg-neutral-100 text-neutral-500" },
  } as const;
  const s = map[status];
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", s.cls)}>
      {s.label}
    </span>
  );
}

function ProductItem({
  companyId,
  baseUrl,
  row,
  canManage,
  onError,
}: {
  companyId: string;
  baseUrl: string;
  row: ProductRow;
  canManage: boolean;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const status = row.page?.status ?? "none";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    onError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) onError(res.error ?? "İşlem başarısız.");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">{row.name}</p>
          <StatusBadge status={status} />
        </div>
        {row.page ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {row.page.seoTitle}
            {row.page.price !== null
              ? ` · ${Number(row.page.price).toLocaleString("tr-TR")} ₺`
              : ""}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Henüz web sayfası yok.
          </p>
        )}
      </div>

      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          {row.page?.status === "published" ? (
            <a
              href={`${baseUrl}/urun/${row.page.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Gör
            </a>
          ) : null}

          {!row.page ? (
            <Button size="sm" disabled={pending} onClick={() => run(() => generateProductPageDraft(companyId, row.materialId))}>
              <Sparkles className="mr-1 h-4 w-4" />
              {pending ? "Üretiliyor..." : "COSMO ile Oluştur"}
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run(() => generateProductPageDraft(companyId, row.materialId))}
              >
                {pending ? "..." : "Yeniden Üret"}
              </Button>
              {row.page.status === "draft" ? (
                <Button size="sm" disabled={pending} onClick={() => run(() => setProductPageStatus(companyId, row.page!.id, true))}>
                  Yayınla
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setProductPageStatus(companyId, row.page!.id, false))}>
                  Yayından Kaldır
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => deleteProductPage(companyId, row.page!.id))}
                title="Sil"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ArticleItem({
  companyId,
  baseUrl,
  row,
  canManage,
  onError,
}: {
  companyId: string;
  baseUrl: string;
  row: ArticleRow;
  canManage: boolean;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    onError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) onError(res.error ?? "İşlem başarısız.");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">{row.title}</p>
          <StatusBadge status={row.status} />
        </div>
        {row.excerpt ? (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{row.excerpt}</p>
        ) : null}
      </div>
      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          {row.status === "published" ? (
            <a
              href={`${baseUrl}/rehber/${row.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Gör
            </a>
          ) : null}
          {row.status === "draft" ? (
            <Button size="sm" disabled={pending} onClick={() => run(() => setArticleStatus(companyId, row.id, true))}>
              Yayınla
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setArticleStatus(companyId, row.id, false))}>
              Yayından Kaldır
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => deleteArticle(companyId, row.id))}
            title="Sil"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function SiteManager({
  companyId,
  brand,
  baseUrl,
  indexable,
  aiPowered,
  canManage,
  products,
  articles,
}: {
  companyId: string;
  brand: string;
  baseUrl: string;
  indexable: boolean;
  aiPowered: boolean;
  canManage: boolean;
  products: ProductRow[];
  articles: ArticleRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("products");
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [writing, startWrite] = useTransition();

  function writeArticle() {
    if (topic.trim().length < 3) {
      setError("Geçerli bir konu/anahtar kelime girin.");
      return;
    }
    setError(null);
    startWrite(async () => {
      const res = await generateArticleDraft(companyId, topic.trim());
      if (!res.ok) setError(res.error);
      else {
        setTopic("");
        router.refresh();
      }
    });
  }

  const publishedCount = products.filter((p) => p.page?.status === "published").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Web Sitesi</h1>
          <p className="text-sm text-muted-foreground">
            {brand} marka sitesi — ERP&apos;den üreyen SEO ürün sayfaları ve rehber
            yazıları. İçeriği COSMO yazar, siz onaylayıp yayınlarsınız.
          </p>
        </div>
        <a
          href={baseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary"
        >
          <Globe className="h-4 w-4" /> Siteyi Aç
        </a>
      </header>

      {!indexable ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          Site şu an arama motorlarına <strong>kapalı</strong> (noindex). Markalı bir
          alan adı bağlanıp <code>NEXT_PUBLIC_SITE_URL</code> ayarlanınca otomatik
          indekslemeye açılır.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex gap-1 border-b border-border">
        {(
          [
            { key: "products", label: "Ürün Sayfaları", icon: Sparkles },
            { key: "articles", label: "Rehber Yazıları", icon: Megaphone },
          ] as const
        ).map((t) => {
          const active = tab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-emerald-600 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "products" ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {products.length} ürün · {publishedCount} yayında. Her ürün için COSMO
            SEO başlık, açıklama ve maddeleri yazar; fiyat ve görsel anlık olarak
            siteye taşınır.
          </p>
          {products.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              Bitmiş ürün yok.
            </p>
          ) : (
            products.map((row) => (
              <ProductItem
                key={row.materialId}
                companyId={companyId}
                baseUrl={baseUrl}
                row={row}
                canManage={canManage}
                onError={setError}
              />
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {canManage ? (
            <div className="rounded-2xl border border-border bg-card p-4">
              <label className="text-sm font-medium">
                Yeni rehber yazısı (long-tail konu/anahtar kelime)
              </label>
              <p className="mb-2 text-xs text-muted-foreground">
                Örn: &quot;magnezyum bisglisinat ne işe yarar&quot;, &quot;B12 eksikliği belirtileri&quot;.
                COSMO yazıyı yazar, taslak olarak kaydeder.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Konu / anahtar kelime"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  disabled={writing}
                />
                <Button disabled={writing || !aiPowered} onClick={writeArticle}>
                  <Sparkles className="mr-1 h-4 w-4" />
                  {writing ? "Yazılıyor..." : "COSMO ile Yaz"}
                </Button>
              </div>
              {!aiPowered ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Makale üretimi için <code>ANTHROPIC_API_KEY</code> gerekli.
                </p>
              ) : null}
            </div>
          ) : null}

          {articles.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              Henüz rehber yazısı yok.
            </p>
          ) : (
            articles.map((row) => (
              <ArticleItem
                key={row.id}
                companyId={companyId}
                baseUrl={baseUrl}
                row={row}
                canManage={canManage}
                onError={setError}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
