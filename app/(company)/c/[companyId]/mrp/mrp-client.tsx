"use client";

import { Boxes, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import {
  createProductionOrdersFromMrp,
  createPurchaseOrdersFromMrp,
} from "./actions";

export function MrpActions({
  companyId,
  hasProduction,
  hasPurchases,
}: {
  companyId: string;
  hasProduction: boolean;
  hasPurchases: boolean;
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
        <Button
          disabled={pending || !hasProduction}
          onClick={() => run(() => createProductionOrdersFromMrp(companyId))}
        >
          <Boxes className="mr-1.5 h-4 w-4" />
          Üretim Emirlerini Oluştur
        </Button>
        <Button
          variant="outline"
          disabled={pending || !hasPurchases}
          onClick={() => run(() => createPurchaseOrdersFromMrp(companyId))}
        >
          <ShoppingCart className="mr-1.5 h-4 w-4" />
          Satınalma Siparişine Dönüştür
        </Button>
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
