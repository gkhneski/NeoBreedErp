"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteLot } from "./actions";

export function LotDeleteButton({
  companyId,
  lotId,
  summary,
}: {
  companyId: string;
  lotId: string;
  summary: string;
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
          if (
            !window.confirm(
              `Bu lot silinsin mi?\n\n${summary}\n\nKalan miktar stoktan düşülür; hareketler defterde kalır.`,
            )
          ) {
            return;
          }
          setError(null);
          startTransition(async () => {
            const res = await deleteLot(companyId, lotId);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            router.refresh();
          });
        }}
        className="rounded-sm border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
        title="Lotu sil"
      >
        Sil
      </button>
      {error ? (
        <p className="max-w-[220px] text-[10px] text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
