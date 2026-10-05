"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import {
  retryMarketplaceAutoShip,
  returnMarketplaceOrderToStock,
  type MarketplaceOrderActionResult,
} from "./actions";

export function RetryAutoShipButton({
  companyId,
  orderNumber,
}: {
  companyId: string;
  orderNumber: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<MarketplaceOrderActionResult | null>(null);

  return (
    <div className="space-y-1 text-right">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await retryMarketplaceAutoShip(companyId, orderNumber);
            setResult(res);
            if (res.ok) router.refresh();
          })
        }
      >
        {pending ? "Deneniyor..." : "Tekrar Dene"}
      </Button>
      {result && !result.ok ? (
        <p className="text-xs text-destructive">{result.error}</p>
      ) : null}
      {result?.ok ? (
        <p className="text-xs text-emerald-700">{result.message}</p>
      ) : null}
    </div>
  );
}

export function ReturnToStockButton({
  companyId,
  orderNumber,
}: {
  companyId: string;
  orderNumber: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<MarketplaceOrderActionResult | null>(null);

  if (!confirming) {
    return (
      <div className="space-y-1 text-right">
        <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
          Depoya Geri Al
        </Button>
        {result && !result.ok ? (
          <p className="text-xs text-destructive">{result.error}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-1 text-right">
      <p className="text-xs text-muted-foreground">
        Kutu depoya fiziksel olarak geldi mi? Düşülen adet stoğa geri yazılır.
      </p>
      <div className="flex justify-end gap-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Vazgeç
        </Button>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await returnMarketplaceOrderToStock(companyId, orderNumber);
              setResult(res);
              setConfirming(false);
              if (res.ok) router.refresh();
            })
          }
        >
          {pending ? "Alınıyor..." : "Evet, Geri Al"}
        </Button>
      </div>
    </div>
  );
}
