"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { reverseStockMovement } from "./actions";

export function MovementCancelButton({
  companyId,
  movementId,
  summary,
}: {
  companyId: string;
  movementId: string;
  summary: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              `Bu hareket iptal edilsin mi?\n\n${summary}\n\nStok geri alınır; kayıt defterde "İptal edildi" olarak kalır.`,
            )
          ) {
            return;
          }
          setError(null);
          startTransition(async () => {
            const res = await reverseStockMovement(companyId, movementId);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            router.refresh();
          });
        }}
        className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
        title="Hareketi iptal et"
      >
        <Trash2 className="h-3 w-3" />
        İptal
      </button>
      {error ? (
        <p className="max-w-[220px] text-right text-[10px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
