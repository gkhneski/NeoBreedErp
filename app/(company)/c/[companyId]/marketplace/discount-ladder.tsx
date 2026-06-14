"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveDiscountTiers } from "./actions";

export type Tier = { max_days_left: number; discount_percent: number };

const SUGGESTED: Tier[] = [
  { max_days_left: 180, discount_percent: 20 },
  { max_days_left: 90, discount_percent: 40 },
  { max_days_left: 30, discount_percent: 70 },
];

function monthsLabel(days: number): string {
  const m = Math.round(days / 30);
  return m >= 1 ? `~${m} ay` : `${days} gün`;
}

export function DiscountLadder({
  companyId,
  tiers,
  canManage,
}: {
  companyId: string;
  tiers: Tier[];
  canManage: boolean;
}) {
  const [rows, setRows] = useState<Tier[]>(
    tiers.length > 0
      ? [...tiers].sort((a, b) => b.max_days_left - a.max_days_left)
      : SUGGESTED,
  );
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  function update(i: number, patch: Partial<Tier>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function remove(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }
  function add() {
    setRows((r) => [...r, { max_days_left: 60, discount_percent: 30 }]);
  }

  function save() {
    setMsg(null);
    const cleaned = rows
      .filter((r) => r.max_days_left > 0 && r.discount_percent > 0)
      .map((r) => ({
        max_days_left: Math.round(r.max_days_left),
        discount_percent: Math.round(r.discount_percent * 100) / 100,
      }));
    startTransition(async () => {
      const res = await saveDiscountTiers(companyId, cleaned);
      setMsg(
        res.error
          ? { kind: "err", text: res.error }
          : { kind: "ok", text: res.success ?? "Kaydedildi." },
      );
    });
  }

  const sortedView = [...rows].sort((a, b) => b.max_days_left - a.max_days_left);

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">İndirim Merdiveni</h2>
        <p className="text-sm text-muted-foreground">
          SKT&apos;ye göre otomatik indirim. Bir ürünün en yakın SKT&apos;li lotu
          buraya girdiğin güne ulaşınca, fiyatı belirlediğin yüzdeyle otomatik
          düşürülmesi önerilir. Sen sadece ürünü ve lotları girersin.
        </p>
      </div>

      <div className="space-y-2">
        {sortedView.map((row) => {
          const i = rows.indexOf(row);
          return (
            <div
              key={i}
              className="flex flex-wrap items-end gap-2 rounded-xl border border-border/70 bg-background p-2.5"
            >
              <div className="space-y-1">
                <Label className="text-xs">Kalan SKT ≤ (gün)</Label>
                <Input
                  type="number"
                  min="1"
                  className="w-28"
                  value={row.max_days_left}
                  disabled={!canManage}
                  onChange={(e) =>
                    update(i, { max_days_left: Number(e.target.value) })
                  }
                />
              </div>
              <span className="pb-2 text-xs text-muted-foreground">
                ({monthsLabel(row.max_days_left)})
              </span>
              <div className="space-y-1">
                <Label className="text-xs">İndirim (%)</Label>
                <Input
                  type="number"
                  min="1"
                  max="95"
                  className="w-24"
                  value={row.discount_percent}
                  disabled={!canManage}
                  onChange={(e) =>
                    update(i, { discount_percent: Number(e.target.value) })
                  }
                />
              </div>
              {canManage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mb-0.5 ml-auto text-muted-foreground hover:text-destructive"
                  onClick={() => remove(i)}
                  aria-label="Kademeyi sil"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          );
        })}
        {sortedView.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Henüz kademe yok. Ekleyerek otomatik indirimi başlatın.
          </p>
        ) : null}
      </div>

      {msg ? (
        <p
          className={
            msg.kind === "ok"
              ? "text-xs text-emerald-700 dark:text-emerald-300"
              : "rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          }
        >
          {msg.kind === "ok" ? "✓ " : ""}
          {msg.text}
        </p>
      ) : null}

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={add}>
            <Plus className="mr-1 h-4 w-4" />
            Kademe Ekle
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={pending}>
            {pending ? "Kaydediliyor..." : "Merdiveni Kaydet"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
