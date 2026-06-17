import type { Metadata } from "next";

import { SITE_BRAND_NAME } from "@/lib/site/config";
import { getPublishedProductPages } from "@/lib/site/queries";

import { ProductCard } from "../_components/product-card";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Ürünler",
  description: `${SITE_BRAND_NAME} gıda takviyesi ve vitamin ürünleri — içerik, fiyat ve Trendyol satın alma bağlantısı.`,
  alternates: { canonical: "/urunler" },
};

export default async function ProductsIndexPage() {
  const products = await getPublishedProductPages();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <header className="mb-8 space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Ürünler</h1>
        <p className="text-neutral-600">
          Tüm {SITE_BRAND_NAME} gıda takviyeleri. İncelemek için ürüne tıklayın,
          Trendyol&apos;dan güvenle sipariş edin.
        </p>
      </header>

      {products.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.slug} page={p} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-300 py-16 text-center text-neutral-400">
          Ürünler yakında burada yayınlanacak.
        </div>
      )}
    </div>
  );
}
