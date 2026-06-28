"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { SalesOrderSource, SalesOrderStatus } from "@/types/database";
import { companyModulePath } from "@/types/roles";

import { postSaleToAccount } from "../accounts/actions";
import {
  convertOrderToShipment,
  markAllSalesOrdersSeen,
  setSalesOrderStatus,
} from "./actions";

const SOURCE_LABEL: Record<SalesOrderSource, string> = {
  portal: "Portal",
  rep: "Bölge müdürü",
  manual: "Manuel / Fason",
};

function PostSaleButton({ companyId, orderId }: { companyId: string; orderId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await postSaleToAccount(companyId, orderId);
            setMsg(res.ok ? (res.note ?? "İşlendi.") : res.error);
            if (res.ok) router.refresh();
          })
        }
      >
        Cariye İşle (Satış)
      </Button>
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}

export type SalesOrderRow = {
  id: string;
  code: string;
  status: SalesOrderStatus;
  source: SalesOrderSource;
  notes: string | null;
  isNew: boolean;
  createdAt: string;
  customerName: string;
  shipmentId: string | null;
  shipmentCode: string | null;
  items: Array<{ name: string; quantity: number; unitPrice: number | null }>;
};

const STATUS: Record<SalesOrderStatus, { label: string; cls: string }> = {
  placed: { label: "Yeni", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  confirmed: { label: "Onaylandı", cls: "bg-violet-500/15 text-violet-700 dark:text-violet-400" },
  preparing: { label: "Hazırlanıyor", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  shipped: { label: "Sevk edildi", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  cancelled: { label: "İptal", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
};

const money = (n: number) =>
  `${Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ₺`;

function OrderActions({
  companyId,
  row,
}: {
  companyId: string;
  row: SalesOrderRow;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set(status: "confirmed" | "preparing" | "cancelled") {
    setError(null);
    start(async () => {
      await setSalesOrderStatus(companyId, row.id, status);
      router.refresh();
    });
  }

  function convert() {
    setError(null);
    start(async () => {
      const res = await convertOrderToShipment(companyId, row.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(companyModulePath(companyId, "shipments", res.shipmentId));
    });
  }

  // Converted or closed orders: just show the linked shipment if any.
  if (row.shipmentId) {
    return (
      <Link
        href={companyModulePath(companyId, "shipments", row.shipmentId)}
        className="inline-flex text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
      >
        Sevkiyat: {row.shipmentCode ?? "Görüntüle"}
      </Link>
    );
  }
  if (row.status === "shipped" || row.status === "cancelled") return null;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {row.status === "placed" ? (
          <Button size="sm" disabled={pending} onClick={() => set("confirmed")}>
            Onayla
          </Button>
        ) : null}
        <Button size="sm" disabled={pending} onClick={convert}>
          Sevkiyata Dönüştür
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (window.confirm("Sipariş iptal edilsin mi?")) set("cancelled");
          }}
        >
          İptal
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function SalesOrdersList({
  companyId,
  rows,
  canWrite,
}: {
  companyId: string;
  rows: SalesOrderRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const hasNew = rows.some((r) => r.isNew);

  return (
    <div className="space-y-3">
      {canWrite && hasNew ? (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await markAllSalesOrdersSeen(companyId);
                router.refresh();
              })
            }
          >
            Tümünü gördüm
          </Button>
        </div>
      ) : null}

      {rows.map((row) => {
        const s = STATUS[row.status];
        const total = row.items.reduce(
          (sum, it) => sum + (it.unitPrice ?? 0) * it.quantity,
          0,
        );
        return (
          <div
            key={row.id}
            className={`rounded-2xl border bg-card p-3 sm:p-4 ${
              row.isNew ? "border-emerald-500/40" : "border-border"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">{row.code}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>
                  {s.label}
                </span>
                {row.isNew ? (
                  <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                    YENİ
                  </span>
                ) : null}
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                  {SOURCE_LABEL[row.source]}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(row.createdAt).toLocaleString("tr-TR")}
              </span>
            </div>

            <p className="mt-1 text-sm font-medium">{row.customerName}</p>

            <ul className="mt-2 space-y-0.5 text-sm text-muted-foreground">
              {row.items.map((it, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>
                    {it.name} × {it.quantity.toLocaleString("tr-TR")}
                  </span>
                  {it.unitPrice !== null ? (
                    <span>{money(it.unitPrice * it.quantity)}</span>
                  ) : null}
                </li>
              ))}
            </ul>

            {total > 0 ? (
              <p className="mt-1 text-right text-sm font-semibold">
                Toplam: {money(total)}
              </p>
            ) : null}

            {row.notes ? (
              <p className="mt-2 text-xs text-muted-foreground">Not: {row.notes}</p>
            ) : null}

            {canWrite ? (
              <div className="mt-3 space-y-2">
                <OrderActions companyId={companyId} row={row} />
                {row.status !== "cancelled" ? (
                  <PostSaleButton companyId={companyId} orderId={row.id} />
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
