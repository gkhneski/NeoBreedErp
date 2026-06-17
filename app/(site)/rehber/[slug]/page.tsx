import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SITE_BRAND_NAME, siteBaseUrl } from "@/lib/site/config";
import { renderMarkdown } from "@/lib/site/markdown";
import {
  getArticleBySlug,
  getProductPagesByMaterialIds,
  getPublishedArticles,
} from "@/lib/site/queries";

import { ProductCard } from "../../_components/product-card";

export const revalidate = 3600;
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const articles = await getPublishedArticles();
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return { title: "Yazı bulunamadı" };
  return {
    title: article.title,
    description: article.excerpt ?? undefined,
    alternates: { canonical: `/rehber/${article.slug}` },
    openGraph: {
      title: article.title,
      description: article.excerpt ?? undefined,
      type: "article",
      url: `${siteBaseUrl()}/rehber/${article.slug}`,
      images: article.cover_image_url ? [{ url: article.cover_image_url }] : undefined,
    },
  };
}

export default async function ArticleDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  const relatedProducts =
    article.related_material_ids.length > 0
      ? await getProductPagesByMaterialIds(article.related_material_ids)
      : [];

  const bodyHtml = renderMarkdown(article.body_md);

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.excerpt ?? undefined,
    image: article.cover_image_url ? [article.cover_image_url] : undefined,
    datePublished: article.published_at ?? undefined,
    author: { "@type": "Organization", name: SITE_BRAND_NAME },
    publisher: { "@type": "Organization", name: SITE_BRAND_NAME },
  };

  const faqLd =
    article.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: article.faq.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }
      : null;

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      {faqLd ? (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
        />
      ) : null}

      <nav className="mb-6 text-sm text-neutral-500">
        <Link href="/rehber" className="hover:text-neutral-900">
          Rehber
        </Link>
        <span className="mx-2">/</span>
        <span className="text-neutral-700">{article.title}</span>
      </nav>

      <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
        {article.title}
      </h1>
      {article.excerpt ? (
        <p className="mt-3 text-lg text-neutral-600">{article.excerpt}</p>
      ) : null}

      <div
        className="site-prose mt-8"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />

      {article.faq.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-2xl font-bold tracking-tight">Sıkça Sorulan Sorular</h2>
          <div className="mt-4 divide-y divide-neutral-200 rounded-2xl border border-neutral-200">
            {article.faq.map((f, i) => (
              <div key={i} className="p-5">
                <h3 className="font-semibold text-neutral-900">{f.q}</h3>
                <p className="mt-1 text-neutral-600">{f.a}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {relatedProducts.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-2xl font-bold tracking-tight">İlgili Ürünler</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {relatedProducts.map((p) => (
              <ProductCard key={p.slug} page={p} />
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
