"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteProductionOrder } from "./actions";

export function OrderDeleteButton({
  companyId,
  orderId,
  summary,
  redirectTo,
}: {
  companyId: string;
  orderId: string;
  summary: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const reason = window.prompt(
            `Bu üretim emri silinsin mi?\n\n${summary}\n\nSilme işlemi protokole kaydedilir. Silme nedenini yazın:`,
          );
          if (reason === null) return;
          if (reason.trim().length < 3) {
            setError("Silme nedeni gerekli.");
            return;
          }
          setError(null);
          startTransition(async () => {
            const res = await deleteProductionOrder(companyId, orderId, reason);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            if (redirectTo) {
              router.push(redirectTo);
            } else {
              router.refresh();
            }
          });
        }}
        className="rounded-sm border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
        title="Üretim emrini sil"
      >
        {pending ? "Siliniyor…" : "Sil"}
      </button>
      {error ? (
        <p className="max-w-[220px] text-[10px] text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
