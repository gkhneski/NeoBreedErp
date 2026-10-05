"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { releaseSalesDepotLot } from "./actions";

// Depocu: satış deposuna sayarak aldığı bitmiş ürün lotunu karantinadan çıkarır.
export function ReleaseLotButton({
  companyId,
  lotId,
}: {
  companyId: string;
  lotId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="default"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await releaseSalesDepotLot(companyId, lotId);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            router.refresh();
          })
        }
      >
        {pending ? "Bırakılıyor..." : "Serbest Bırak"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
