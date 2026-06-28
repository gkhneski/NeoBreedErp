"use client";

import { PackageCheck, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { receivePurchaseOrder, sendPurchaseOrder } from "./actions";

export function PoActions({
  companyId,
  poId,
  status,
}: {
  companyId: string;
  poId: string;
  status: "draft" | "sent" | "received" | "cancelled";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string; note?: string }>) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setMsg({ kind: "err", text: res.error ?? "İşlem başarısız." });
        return;
      }
      setMsg({ kind: "ok", text: res.note ?? "Tamamlandı." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "draft" ? (
          <Button
            disabled={pending}
            onClick={() => run(() => sendPurchaseOrder(companyId, poId))}
          >
            <Send className="mr-1.5 h-4 w-4" />
            Tedarikçiye Gönder
          </Button>
        ) : null}
        {status === "sent" || status === "draft" ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(() => receivePurchaseOrder(companyId, poId))}
          >
            <PackageCheck className="mr-1.5 h-4 w-4" />
            Mal Kabul Et
          </Button>
        ) : null}
      </div>
      {msg ? (
        <p
          className={`text-sm ${
            msg.kind === "ok" ? "text-emerald-600" : "text-destructive"
          }`}
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
