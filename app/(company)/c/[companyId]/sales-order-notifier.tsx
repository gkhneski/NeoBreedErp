"use client";

import { Bell, ShoppingCart, Volume2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { companyModulePath } from "@/types/roles";

import {
  markAllSalesOrdersSeen,
  markSalesOrderSeen,
  pollNewSalesOrders,
  type UnseenOrder,
} from "./sales-orders/actions";

const POLL_MS = 30_000;

// Sesli + masaustu uyari: yeni B2B siparisi gelince, depocu ERP'de hangi ekranda
// olursa olsun (hatta baska sekmedeyken) haber alir. Layout'a mount edilir.
export function SalesOrderNotifier({ companyId }: { companyId: string }) {
  const [orders, setOrders] = useState<UnseenOrder[]>([]);
  const [, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const shown = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const audioCtx = useRef<AudioContext | null>(null);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");

  // Tarayici otomatik ses calmayi engeller; ses baglami ancak kullanici
  // etkilesiminde olusturulup acilirsa sonradan zamanlayicidan calabilir.
  const ensureAudio = useCallback((): AudioContext | null => {
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      if (!audioCtx.current) audioCtx.current = new Ctor();
      if (audioCtx.current.state === "suspended") void audioCtx.current.resume();
      return audioCtx.current;
    } catch {
      return null;
    }
  }, []);

  const beep = useCallback(() => {
    const ctx = ensureAudio();
    if (!ctx) return;
    try {
      [
        [0, 880],
        [0.18, 1175],
      ].forEach(([offset, freq]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = ctx.currentTime + offset;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.18);
      });
    } catch {
      // audio blocked/unsupported — desktop notification still fires
    }
  }, [ensureAudio]);

  const notify = useCallback((o: UnseenOrder) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    try {
      new Notification("Yeni eczane siparişi", {
        body: `${o.customerName} — ${o.summary || o.code}`,
        tag: o.id,
      });
    } catch {
      // ignore
    }
  }, []);

  const poll = useCallback(async () => {
    const res = await pollNewSalesOrders(companyId);
    if (!res.ok) return;
    setOrders(res.orders);

    if (!initialized.current) {
      res.orders.forEach((o) => shown.current.add(o.id));
      initialized.current = true;
      return;
    }
    const fresh = res.orders.filter((o) => !shown.current.has(o.id));
    if (fresh.length > 0) {
      beep();
      fresh.forEach((o) => {
        shown.current.add(o.id);
        notify(o);
      });
    }
  }, [companyId, beep, notify]);

  useEffect(() => {
    setMounted(true);
    setPerm(
      typeof window !== "undefined" && "Notification" in window
        ? Notification.permission
        : "unsupported",
    );

    // İlk kullanıcı etkileşiminde ses bağlamını oluştur+aç (sessizce).
    const unlock = () => {
      const ctx = ensureAudio();
      if (ctx) setSoundOn(true);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    const onVisible = () => {
      if (document.visibilityState === "visible") ensureAudio();
    };
    document.addEventListener("visibilitychange", onVisible);

    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => {
      clearInterval(id);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll, ensureAudio]);

  function enableSound() {
    const ctx = ensureAudio();
    setSoundOn(!!ctx);
    beep(); // test sesi
  }

  function enableDesktop() {
    if (!("Notification" in window)) return;
    void Notification.requestPermission().then((p) => setPerm(p));
  }

  function handleSeen(id: string) {
    setOrders((os) => os.filter((o) => o.id !== id));
    startTransition(() => void markSalesOrderSeen(companyId, id));
  }
  function handleAllSeen() {
    setOrders([]);
    startTransition(() => void markAllSalesOrdersSeen(companyId));
  }

  if (!mounted) return null;

  const needsSound = !soundOn;
  const needsDesktop = perm !== "granted" && perm !== "unsupported";

  // Ses/bildirim kapalıysa, sipariş yokken bile küçük bir "etkinleştir" çubuğu
  // göster — böylece kullanıcı önceden açabilir ve ilk sipariş sessiz kalmaz.
  if (orders.length === 0) {
    if (!needsSound && !needsDesktop) return null;
    return createPortal(
      <div className="fixed bottom-4 right-4 z-[100] flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
        {needsSound ? (
          <button
            type="button"
            onClick={enableSound}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white"
          >
            <Volume2 className="h-3.5 w-3.5" />
            Sipariş sesini aç
          </button>
        ) : null}
        {needsDesktop ? (
          <button
            type="button"
            onClick={enableDesktop}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium"
          >
            <Bell className="h-3.5 w-3.5" />
            Masaüstü bildirimi
          </button>
        ) : null}
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[100] w-[min(92vw,360px)]">
      <div className="overflow-hidden rounded-2xl border border-amber-300 bg-amber-50 shadow-2xl dark:border-amber-700 dark:bg-amber-950/40">
        <div className="flex items-center justify-between gap-2 border-b border-amber-200 px-4 py-2.5 dark:border-amber-800">
          <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-100">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-600" />
            </span>
            <Bell className="h-4 w-4" />
            Yeni Sipariş ({orders.length})
          </div>
          <button
            type="button"
            onClick={handleAllSeen}
            className="text-xs font-medium text-amber-800 hover:underline dark:text-amber-200"
          >
            Tümünü gördüm
          </button>
        </div>

        <ul className="max-h-64 space-y-1.5 overflow-y-auto p-2.5">
          {orders.map((o) => (
            <li
              key={o.id}
              className="flex items-start justify-between gap-2 rounded-xl bg-card px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {o.code} · {o.customerName}
                </p>
                <p className="truncate text-xs text-muted-foreground">{o.summary || "—"}</p>
              </div>
              <button
                type="button"
                onClick={() => handleSeen(o.id)}
                aria-label="Gördüm"
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-amber-200 px-3 py-2 dark:border-amber-800">
          <div className="flex items-center gap-2">
            {needsSound ? (
              <Button size="sm" variant="outline" onClick={enableSound}>
                <Volume2 className="mr-1 h-4 w-4" />
                Sesi aç
              </Button>
            ) : null}
            {needsDesktop ? (
              <Button size="sm" variant="outline" onClick={enableDesktop}>
                Masaüstü bildirimi aç
              </Button>
            ) : null}
          </div>
          <Link href={companyModulePath(companyId, "sales-orders")}>
            <Button size="sm">
              <ShoppingCart className="mr-1 h-4 w-4" />
              Siparişlere git
            </Button>
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}
