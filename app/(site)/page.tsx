import Link from "next/link";

import { SITE_BRAND_NAME, SITE_TAGLINE } from "@/lib/site/config";
import { getPublishedArticles, getPublishedProductPages } from "@/lib/site/queries";

import { ProductCard } from "./_components/product-card";

// Rebuilt at most hourly; publishing an item revalidates its routes immediately.
export const revalidate = 3600;

const VALUE_PROPS = [
  {
    title: "Üretici güvencesi",
    body: "Kendi tesisimizde üretilen, içeriği şeffaf gıda takviyeleri.",
  },
  {
    title: "Trendyol'da satışta",
    body: "Ürünlerimizi güvenle Trendyol mağazamızdan sipariş edebilirsiniz.",
  },
  {
    title: "Bilgi rehberi",
    body: "Vitamin ve minerallerin ne işe yaradığını sade dille anlatıyoruz.",
  },
];

export default async function SiteHomePage() {
  const [products, articles] = await Promise.all([
    getPublishedProductPages(),
    getPublishedArticles(),
  ]);
  const featured = products.slice(0, 8);
  const latestGuides = articles.slice(0, 3);

  return (
    <>
      <section className="border-b border-neutral-100 bg-gradient-to-b from-emerald-50/60 to-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-2xl space-y-5">
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              Gıda Takviyesi & Vitamin
            </span>
            <h1 className="text-4xl font-extrabold tracking-tight text-neutral-900 sm:text-5xl">
              {SITE_BRAND_NAME}
            </h1>
            <p className="text-lg text-neutral-600">{SITE_TAGLINE}</p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/urunler"
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Ürünleri Keşfet
              </Link>
              <Link
                href="/rehber"
                className="rounded-xl border border-neutral-300 px-5 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-100"
              >
                Sağlık Rehberi
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {VALUE_PROPS.map((v) => (
            <div key={v.title} className="rounded-2xl border border-neutral-200 p-5">
              <h2 className="text-sm font-bold text-neutral-900">{v.title}</h2>
              <p className="mt-1 text-sm text-neutral-600">{v.body}</p>
            </div>
          ))}
        </div>
      </section>

      {featured.length > 0 ? (
        <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Öne Çıkan Ürünler</h2>
            <Link
              href="/urunler"
              className="text-sm font-semibold text-emerald-600 hover:underline"
            >
              Tümü →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featured.map((p) => (
              <ProductCard key={p.slug} page={p} />
            ))}
          </div>
        </section>
      ) : (
        <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          <div className="rounded-2xl border border-dashed border-neutral-300 py-16 text-center text-neutral-400">
            Ürünler yakında burada yayınlanacak.
          </div>
        </section>
      )}

      {latestGuides.length > 0 ? (
        <section className="mx-auto w-full max-w-6xl px-4 py-8 pb-16 sm:px-6">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Sağlık Rehberi</h2>
            <Link
              href="/rehber"
              className="text-sm font-semibold text-emerald-600 hover:underline"
            >
              Tümü →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {latestGuides.map((a) => (
              <Link
                key={a.slug}
                href={`/rehber/${a.slug}`}
                className="flex flex-col rounded-2xl border border-neutral-200 p-5 transition-shadow hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.2)]"
              >
                <h3 className="text-base font-semibold text-neutral-900">{a.title}</h3>
                {a.excerpt ? (
                  <p className="mt-2 line-clamp-3 text-sm text-neutral-600">{a.excerpt}</p>
                ) : null}
                <span className="mt-4 text-xs font-semibold text-emerald-600">
                  Devamını oku →
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
