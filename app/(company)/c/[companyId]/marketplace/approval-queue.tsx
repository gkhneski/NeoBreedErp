"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { approvePriceEvent, dismissPriceEvent } from "./actions";

export type PendingEventRow = {
  id: string;
  kind: "discount" | "restore" | "manual";
  old_price: number | null;
  new_price: number;
  trigger_expiry_date: string | null;
  trigger_days_left: number | null;
  created_at: string;
  listing: {
    barcode: string;
    title: string | null;
    materials: { code: string; name: string } | null;
  } | null;
};

const KIND_LABEL: Record<PendingEventRow["kind"], string> = {
  discount: "İndirim",
  restore: "Normale Dön",
  manual: "Manuel",
};

const KIND_VARIANT: Record<
  PendingEventRow["kind"],
  "warning" | "default" | "secondary"
> = {
  discount: "warning",
  restore: "default",
  manual: "secondary",
};

function formatPrice(n: number): string {
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function ApprovalQueue({
  companyId,
  events,
  canApprove,
}: {
  companyId: string;
  events: PendingEventRow[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function act(eventId: string, action: "approve" | "dismiss") {
    setBusyId(eventId);
    setError(null);
    startTransition(async () => {
      const result =
        action === "approve"
          ? await approvePriceEvent(companyId, eventId)
          : await dismissPriceEvent(companyId, eventId);
      if (!result.ok) setError(result.error);
      setBusyId(null);
      router.refresh();
    });
  }

  if (events.length === 0) {
    return (
      <p className="rounded-md border border-border px-3 py-4 text-sm text-muted-foreground">
        Bekleyen öneri yok. SKT eşiğine giren ürünler burada listelenir.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
        {events.map((event) => {
          const product = event.listing?.materials;
          const busy = pending && busyId === event.id;
          return (
            <li
              key={event.id}
              className="flex flex-wrap items-center gap-3 bg-card px-3 py-3"
            >
              <Badge variant={KIND_VARIANT[event.kind]}>
                {KIND_LABEL[event.kind]}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {product ? `${product.code} — ${product.name}` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{event.listing?.barcode}</span>
                  {event.trigger_expiry_date ? (
                    <>
                      {" · "}SKT {event.trigger_expiry_date}
                      {event.trigger_days_left !== null
                        ? ` · ${event.trigger_days_left} gün kaldı`
                        : ""}
                    </>
                  ) : null}
                </p>
              </div>
              <p className="font-mono text-sm">
                {event.old_price !== null ? (
                  <>
                    <span className="text-muted-foreground line-through">
                      {formatPrice(Number(event.old_price))} ₺
                    </span>{" "}
                    →{" "}
                  </>
                ) : null}
                <span className="font-semibold">
                  {formatPrice(Number(event.new_price))} ₺
                </span>
              </p>
              {canApprove ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => act(event.id, "approve")}
                  >
                    {busy ? "Gönderiliyor..." : "Onayla ve Gönder"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => act(event.id, "dismiss")}
                  >
                    Reddet
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
