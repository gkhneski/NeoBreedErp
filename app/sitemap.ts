import type { MetadataRoute } from "next";

import { siteBaseUrl, siteIsIndexable } from "@/lib/site/config";
import { getPublishedArticles, getPublishedProductPages } from "@/lib/site/queries";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Until a real domain is attached we stay noindex; an empty sitemap avoids
  // submitting the vercel.app preview to search engines.
  if (!siteIsIndexable()) return [];

  const base = siteBaseUrl();
  const [products, articles] = await Promise.all([
    getPublishedProductPages(),
    getPublishedArticles(),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/urunler`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/rehber`, changeFrequency: "weekly", priority: 0.7 },
  ];

  const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${base}/urun/${p.slug}`,
    lastModified: p.published_at ?? undefined,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const articleRoutes: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${base}/rehber/${a.slug}`,
    lastModified: a.published_at ?? undefined,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...productRoutes, ...articleRoutes];
}
