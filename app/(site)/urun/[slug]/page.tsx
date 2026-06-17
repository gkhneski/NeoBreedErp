import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  SITE_BRAND_NAME,
  siteBaseUrl,
  trendyolSearchUrl,
} from "@/lib/site/config";
import { getProductPageBySlug, getPublishedProductPages } from "@/lib/site/queries";

import { formatTL } from "../../_components/product-card";

export const revalidate = 3600;
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const products = await getPublishedProductPages();
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getProductPageBySlug(slug);
  if (!page) return { title: "Ürün bulunamadı" };
  return {
    title: page.seo_title,
    description: page.seo_description,
    alternates: { canonical: `/urun/${page.slug}` },
    openGraph: {
      title: page.seo_title,
      description: page.seo_description,
      type: "website",
      url: `${siteBaseUrl()}/urun/${page.slug}`,
      images: page.og_image_url ? [{ url: page.og_image_url }] : undefined,
    },
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const page = await getProductPageBySlug(slug);
  if (!page) notFound();

  const price = formatTL(page.price_snapshot);
  const buyUrl = trendyolSearchUrl(page.barcode_snapshot, page.seo_title);

  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: page.seo_title,
    description: page.seo_description,
    image: page.og_image_url ? [page.og_image_url] : undefined,
    brand: { "@type": "Brand", name: SITE_BRAND_NAME },
    ...(page.barcode_snapshot ? { gtin: page.barcode_snapshot } : {}),
    ...(page.price_snapshot !== null
      ? {
          offers: {
            "@type": "Offer",
            price: Number(page.price_snapshot).toFixed(2),
            priceCurrency: "TRY",
            availability: "https://schema.org/InStock",
            url: buyUrl,
          },
        }
      : {}),
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }}
      />

      <nav className="mb-6 text-sm text-neutral-500">
        <Link href="/urunler" className="hover:text-neutral-900">
          Ürünler
        </Link>
        <span className="mx-2">/</span>
        <span className="text-neutral-700">{page.seo_title}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-neutral-100">
          {page.og_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={page.og_image_url}
              alt={page.seo_title}
              className="aspect-square w-full object-cover"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center text-6xl text-neutral-300">
              {page.seo_title.charAt(0)}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
              {SITE_BRAND_NAME}
            </span>
            <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900 sm:text-3xl">
              {page.seo_title}
            </h1>
          </div>

          {price ? (
            <div className="text-3xl font-bold text-emerald-600">{price}</div>
          ) : null}

          <p className="text-neutral-600">{page.seo_description}</p>

          {page.bullets.length > 0 ? (
            <ul className="space-y-2">
              {page.bullets.map((b, i) => (
                <li key={i} className="flex gap-2 text-sm text-neutral-700">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <a
            href={buyUrl}
            target="_blank"
            rel="noopener noreferrer nofollow sponsored"
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[#f27a1a] px-6 py-3.5 text-base font-bold text-white transition-colors hover:bg-[#d96a12]"
          >
            Trendyol&apos;da Satın Al →
          </a>
          <p className="text-xs text-neutral-400">
            Sipariş ve teslimat Trendyol üzerinden güvenle gerçekleşir.
          </p>
        </div>
      </div>
    </div>
  );
}
