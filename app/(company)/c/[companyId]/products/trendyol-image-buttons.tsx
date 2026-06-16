"use client";

import { ImageDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { pullAllTrendyolImages, pullTrendyolImage } from "./actions";

export function PullAllImagesButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run() {
    setMsg(null);
    start(async () => {
      const res = await pullAllTrendyolImages(companyId);
      if (!res.ok) {
        setMsg(res.error);
        return;
      }
      setMsg(
        res.saved > 0
          ? `${res.saved} ürün resmi kaydedildi${res.skipped ? `, ${res.skipped} atlandı` : ""}.`
          : "Kaydedilecek yeni resim bulunamadı.",
      );
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {msg ? (
        <span className="max-w-xs text-xs text-muted-foreground">{msg}</span>
      ) : null}
      <Button variant="outline" disabled={pending} onClick={run}>
        <ImageDown className="mr-1.5 h-4 w-4" />
        {pending ? "Çekiliyor..." : "Resimleri Trendyol'dan Çek"}
      </Button>
    </div>
  );
}

export function PullProductImageButton({
  companyId,
  productId,
}: {
  companyId: string;
  productId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    start(async () => {
      const res = await pullTrendyolImage(companyId, productId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button size="sm" variant="outline" disabled={pending} onClick={run}>
        <ImageDown className="mr-1.5 h-4 w-4" />
        {pending ? "Çekiliyor..." : "Trendyol'dan resmi çek"}
      </Button>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
