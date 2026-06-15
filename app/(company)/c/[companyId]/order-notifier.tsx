"use client";

import { Bell, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import {
  markAllOrdersSeen,
  markOrderSeen,
  syncTrendyolOrders,
  type NewOrder,
} from "./order-notifier-actions";

const POLL_MS = 90_000;

// Depot-only: polls Trendyol orders and alerts the operator (in-app banner +
// desktop notification) when a new order arrives.
export function OperatorOrderNotifier({ companyId }: { companyId: string }) {
  const [orders, setOrders] = useState<NewOrder[]>([]);
  const [, startTransition] = useTransition();
  const shown = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    "default",
  );

  const notify = useCallback((o: NewOrder) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    try {
      new Notification("Yeni Trendyol siparişi", {
        body: `${o.customer_name ?? ""} — ${o.summary || o.order_number}`.trim(),
        tag: o.order_number,
      });
    } catch {
      // ignore
    }
  }, []);

  const poll = useCallback(async () => {
    const res = await syncTrendyolOrders(companyId);
    if (!res.ok) return;
    setOrders(res.orders);
    if (!initialized.current) {
      // İlk yüklemede mevcutları sadece göster; bildirim yağdırma.
      res.orders.forEach((o) => shown.current.add(o.order_number));
      initialized.current = true;
      return;
    }
    for (const o of res.orders) {
      if (!shown.current.has(o.order_number)) {
        shown.current.add(o.order_number);
        notify(o);
      }
    }
  }, [companyId, notify]);

  useEffect(() => {
    setPerm(
      typeof window !== "undefined" && "Notification" in window
        ? Notification.permission
        : "unsupported",
    );
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  function enableDesktop() {
    if (!("Notification" in window)) return;
    Notification.requestPermission().then((p) => setPerm(p));
  }

  function handleSeen(orderNumber: string) {
    setOrders((os) => os.filter((o) => o.order_number !== orderNumber));
    startTransition(() => {
      void markOrderSeen(companyId, orderNumber);
    });
  }
  function handleAllSeen() {
    setOrders([]);
    startTransition(() => {
      void markAllOrdersSeen(companyId);
    });
  }

  if (orders.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
          <Bell className="h-5 w-5" />
          Yeni Trendyol Siparişi ({orders.length})
        </div>
        <div className="flex items-center gap-2">
          {perm !== "granted" && perm !== "unsupported" ? (
            <Button size="sm" variant="outline" onClick={enableDesktop}>
              Masaüstü bildirimi aç
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={handleAllSeen}>
            Tümünü gördüm
          </Button>
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {orders.map((o) => (
          <li
            key={o.order_number}
            className="flex items-start justify-between gap-3 rounded-xl bg-card px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">
                #{o.order_number}
                {o.customer_name ? ` · ${o.customer_name}` : ""}
                {o.status ? ` · ${o.status}` : ""}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {o.summary || "—"}
              </p>
              {o.order_date ? (
                <p className="text-[11px] text-muted-foreground">
                  {new Date(o.order_date).toLocaleString("tr-TR")}
                </p>
              ) : null}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleSeen(o.order_number)}
              aria-label="Gördüm"
            >
              <X className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
