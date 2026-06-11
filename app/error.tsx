"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight">
        Bir şeyler ters gitti
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Beklenmeyen bir hata oluştu. Tekrar deneyebilirsiniz; sorun sürerse
        platform yöneticinize aşağıdaki hata kodunu iletin.
      </p>
      {error.digest ? (
        <code className="rounded-md bg-secondary px-3 py-1 font-mono text-xs">
          {error.digest}
        </code>
      ) : null}
      <Button onClick={reset}>Tekrar Dene</Button>
    </div>
  );
}
