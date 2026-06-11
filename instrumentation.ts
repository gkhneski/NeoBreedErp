import type { Instrumentation } from "next";

// Sunucu tarafi yakalanmamis hatalari yapilandirilmis tek satir JSON olarak
// loglar; `vercel logs <url> --level error` ile sorgulanabilir.
// Harici izleme (Sentry vb.) eklenirse raporlama buraya baglanir.
export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  const err = error as { digest?: string; message?: string };
  console.error(
    JSON.stringify({
      source: "onRequestError",
      digest: err.digest ?? null,
      message: err.message ?? String(error),
      path: request.path,
      method: request.method,
      routeType: context.routeType,
    }),
  );
};
