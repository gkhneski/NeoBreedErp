import type { MetadataRoute } from "next";

import { siteBaseUrl, siteIsIndexable } from "@/lib/site/config";

export default function robots(): MetadataRoute.Robots {
  const base = siteBaseUrl();

  // On *.vercel.app (no branded domain yet) block all indexing so the preview
  // never competes with or penalizes the future real domain. Flip via env once
  // a domain is attached (NEXT_PUBLIC_SITE_URL set + NEXT_PUBLIC_SITE_INDEXABLE).
  if (!siteIsIndexable()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: [
      // Public marketing pages are indexable; private app surfaces are not.
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/c/", "/portal/", "/superadmin/", "/auth/", "/login", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
