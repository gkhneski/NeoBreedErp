// Public marketing-site configuration. Single source for brand strings, base URL,
// indexability, company resolution, and slug/CTA helpers. Domain→company mapping is
// intentionally funneled through resolveSiteCompany() so the multi-brand step later
// changes one place.

export const SITE_BRAND_NAME = process.env.NEXT_PUBLIC_SITE_BRAND_NAME ?? "NeuPharma";
export const SITE_TAGLINE =
  process.env.NEXT_PUBLIC_SITE_TAGLINE ??
  "Bilimsel gıda takviyeleri — vitamin, mineral ve sağlık desteği.";

// Which company's published content this site serves. Single brand for now.
export function resolveSiteCompany(): string | null {
  return process.env.NEXT_PUBLIC_SITE_COMPANY_ID ?? null;
}

// Absolute base URL used for canonical/OG/sitemap. Prefer an explicit configured
// domain; fall back to the Vercel deployment URL, then localhost in dev.
export function siteBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

// Index only once a real branded domain is attached. Gated by an explicit flag so
// it never turns on by accident — AND hard-blocked on any *.vercel.app host so a
// preview/temporary deployment can never be indexed even if the flag is left on.
export function siteIsIndexable(): boolean {
  if (process.env.NEXT_PUBLIC_SITE_INDEXABLE !== "true") return false;
  return !/vercel\.app/i.test(siteBaseUrl());
}

const TR_MAP: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u",
  Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u",
};

export function slugify(input: string): string {
  return input
    .trim()
    .replace(/[çğıİöşüÇĞÖŞÜ]/g, (ch) => TR_MAP[ch] ?? ch)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

// No stored Trendyol product URL — a barcode search reliably lands on the listing.
export function trendyolSearchUrl(barcode: string | null, fallbackQuery?: string): string {
  const q = (barcode && barcode.trim()) || fallbackQuery || "";
  return `https://www.trendyol.com/sr?q=${encodeURIComponent(q)}`;
}
