import Link from "next/link";
import type { Metadata } from "next";

import { SITE_BRAND_NAME } from "@/lib/site/config";
import { getPublishedArticles } from "@/lib/site/queries";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Sağlık Rehberi",
  description: `Vitamin, mineral ve gıda takviyeleri hakkında sade ve güvenilir bilgiler — ${SITE_BRAND_NAME}.`,
  alternates: { canonical: "/rehber" },
};

export default async function GuideIndexPage() {
  const articles = await getPublishedArticles();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <header className="mb-8 space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Sağlık Rehberi</h1>
        <p className="text-neutral-600">
          Vitamin ve minerallerin ne işe yaradığını, nasıl kullanılacağını sade
          dille anlatıyoruz.
        </p>
      </header>

      {articles.length > 0 ? (
        <div className="space-y-4">
          {articles.map((a) => (
            <Link
              key={a.slug}
              href={`/rehber/${a.slug}`}
              className="block rounded-2xl border border-neutral-200 p-6 transition-shadow hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.2)]"
            >
              <h2 className="text-xl font-bold text-neutral-900">{a.title}</h2>
              {a.excerpt ? (
                <p className="mt-2 text-neutral-600">{a.excerpt}</p>
              ) : null}
              <span className="mt-3 inline-block text-sm font-semibold text-emerald-600">
                Devamını oku →
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-300 py-16 text-center text-neutral-400">
          Rehber yazıları yakında burada yayınlanacak.
        </div>
      )}
    </div>
  );
}
