"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { runDetectionNow } from "./actions";

export function DetectionButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await runDetectionNow(companyId);
      setMessage(result.ok ? result.message : result.error);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {message ? (
        <span className="max-w-xs text-xs text-muted-foreground">
          {message}
        </span>
      ) : null}
      <Button variant="outline" disabled={pending} onClick={handleClick}>
        {pending ? "Kontrol ediliyor..." : "Şimdi Kontrol Et"}
      </Button>
    </div>
  );
}
