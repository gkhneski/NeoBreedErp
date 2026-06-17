import Link from "next/link";

import type { PublicProductPage } from "@/lib/site/queries";

export function formatTL(n: number | null): string | null {
  if (n === null || Number.isNaN(Number(n))) return null;
  return `${Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ₺`;
}

export function ProductCard({ page }: { page: PublicProductPage }) {
  const price = formatTL(page.price_snapshot);
  return (
    <Link
      href={`/urun/${page.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white transition-shadow hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.2)]"
    >
      <div className="aspect-square overflow-hidden bg-neutral-100">
        {page.og_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.og_image_url}
            alt={page.seo_title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-300">
            {page.seo_title.charAt(0)}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-neutral-900">
          {page.seo_title}
        </h3>
        <div className="mt-auto flex items-center justify-between pt-2">
          {price ? (
            <span className="text-base font-bold text-emerald-600">{price}</span>
          ) : (
            <span className="text-sm text-neutral-400">Detaylar</span>
          )}
          <span className="text-xs font-medium text-neutral-400 group-hover:text-emerald-600">
            İncele →
          </span>
        </div>
      </div>
    </Link>
  );
}
