import Link from "next/link";
import type { Metadata } from "next";

import { SITE_BRAND_NAME, SITE_TAGLINE, siteBaseUrl } from "@/lib/site/config";

export const metadata: Metadata = {
  metadataBase: new URL(siteBaseUrl()),
  title: {
    default: `${SITE_BRAND_NAME} — Gıda Takviyesi & Vitamin`,
    template: `%s | ${SITE_BRAND_NAME}`,
  },
  description: SITE_TAGLINE,
  openGraph: {
    siteName: SITE_BRAND_NAME,
    type: "website",
    locale: "tr_TR",
  },
};

const NAV = [
  { href: "/urunler", label: "Ürünler" },
  { href: "/rehber", label: "Rehber" },
];

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-900">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white">
              {SITE_BRAND_NAME.charAt(0)}
            </span>
            <span className="text-lg font-bold tracking-tight">{SITE_BRAND_NAME}</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm font-medium">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-neutral-200 bg-neutral-50">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-neutral-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="font-semibold text-neutral-700">{SITE_BRAND_NAME}</p>
            <p>{SITE_TAGLINE}</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/urunler" className="hover:text-neutral-900">
              Ürünler
            </Link>
            <Link href="/rehber" className="hover:text-neutral-900">
              Rehber
            </Link>
            <Link href="/login" className="hover:text-neutral-900">
              Giriş
            </Link>
          </div>
        </div>
        <div className="border-t border-neutral-200 px-4 py-4 text-center text-xs text-neutral-400 sm:px-6">
          © {new Date().getFullYear()} {SITE_BRAND_NAME}. Tüm hakları saklıdır.
        </div>
      </footer>
    </div>
  );
}
