"use client";

import { Bell, ShoppingCart, X } from "lucide-react";
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
  const shown = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const audioCtx = useRef<AudioContext | null>(null);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");

  const beep = useCallback(() => {
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      if (!audioCtx.current) audioCtx.current = new Ctor();
      const ctx = audioCtx.current;
      if (ctx.state === "suspended") void ctx.resume();
      // Two short rising tones — a clear "ding-ding".
      [0, 0.18].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = i === 0 ? 880 : 1175;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.16);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.18);
      });
    } catch {
      // audio blocked/unsupported — desktop notification still fires
    }
  }, []);

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
    // Resume audio on the first user gesture so later beeps are audible.
    const unlock = () => {
      if (audioCtx.current?.state === "suspended") void audioCtx.current.resume();
    };
    window.addEventListener("pointerdown", unlock, { once: true });

    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => {
      clearInterval(id);
      window.removeEventListener("pointerdown", unlock);
    };
  }, [poll]);

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

  if (!mounted || orders.length === 0) return null;

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

        <div className="flex items-center justify-between gap-2 border-t border-amber-200 px-3 py-2 dark:border-amber-800">
          {perm !== "granted" && perm !== "unsupported" ? (
            <Button size="sm" variant="outline" onClick={enableDesktop}>
              Masaüstü bildirimi aç
            </Button>
          ) : (
            <span />
          )}
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
