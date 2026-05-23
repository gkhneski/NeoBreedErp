import "server-only";

export function readSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const vercelUrl = process.env.VERCEL_URL;
  const candidate =
    explicit && !explicit.includes("localhost")
      ? explicit
      : vercelProduction || vercelUrl || explicit;

  if (!candidate) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL ortam değişkeni tanımlı değil. Davet linki üretilemiyor.",
    );
  }

  const withProtocol = candidate.startsWith("http")
    ? candidate
    : `https://${candidate}`;
  return withProtocol.replace(/\/$/, "");
}

export function authAcceptRedirectUrl(): string {
  return `${readSiteUrl()}/auth/accept?next=/welcome`;
}
