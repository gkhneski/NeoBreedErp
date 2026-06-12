"use client";

import { CircleCheck } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const FLASH_MESSAGES: Record<string, string> = {
  created: "Kayıt oluşturuldu.",
  updated: "Değişiklikler kaydedildi.",
  deleted: "Kayıt silindi.",
  saved: "Kaydedildi.",
  transferred: "Transfer tamamlandı.",
  shipped: "Sipariş gönderildi.",
};

const DISMISS_AFTER_MS = 3500;

export function FlashToast() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  const flash = searchParams.get("flash");

  useEffect(() => {
    if (!flash) return;
    const text = FLASH_MESSAGES[flash];
    if (!text) return;

    setMessage(text);

    const params = new URLSearchParams(searchParams);
    params.delete("flash");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });

    const timer = setTimeout(() => setMessage(null), DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash, pathname]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-md border border-border bg-card px-4 py-3 text-sm shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <CircleCheck className="h-4 w-4 text-primary" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
