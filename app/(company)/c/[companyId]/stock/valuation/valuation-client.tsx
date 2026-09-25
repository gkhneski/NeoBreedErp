"use client";

import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from "@/lib/currencies";
import { cn } from "@/lib/utils";

import { applyOpeningCosts } from "./actions";

export type MaterialGroup = {
  materialId: string;
  code: string;
  name: string;
  uom: string;
  group: "raw" | "packaging" | "semi" | "finished";
  totalQty: number;
  lots: Array<{ id: string; lotNumber: string; qty: number; receivedAt: string }>;
  hintCost: number | null;
  hintCurrency: string | null;
};

const GROUP_LABEL: Record<MaterialGroup["group"], string> = {
  raw: "Hammadde",
  packaging: "Ambalaj",
  semi: "Yarı Mamül",
  finished: "Bitmiş Ürün",
};
const GROUP_ORDER: MaterialGroup["group"][] = ["raw", "packaging", "semi", "finished"];

const nf = (n: number, max = 3) =>
  Number(n).toLocaleString("tr-TR", { maximumFractionDigits: max });
const money = (n: number) =>
  Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

type Draft = { cost: string; currency: SupportedCurrency };

export function ValuationClient({
  companyId,
  canManage,
  groups,
}: {
  companyId: string;
  canManage: boolean;
  groups: MaterialGroup[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      groups.map((g) => [
        g.materialId,
        {
          cost: "",
          currency: (SUPPORTED_CURRENCIES as readonly string[]).includes(
            g.hintCurrency ?? "",
          )
            ? (g.hintCurrency as SupportedCurrency)
            : "TRY",
        },
      ]),
    ),
  );
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const entries = useMemo(
    () =>
      groups
        .map((g) => {
          const d = drafts[g.materialId];
          const v = d ? Number(d.cost.replace(",", ".")) : NaN;
          if (!d || d.cost.trim() === "" || !Number.isFinite(v) || v < 0) return null;
          return { materialId: g.materialId, unitCost: v, currency: d.currency };
        })
        .filter((e): e is NonNullable<typeof e> => e !== null),
    [groups, drafts],
  );

  const totalValue = useMemo(() => {
    const byCur = new Map<string, number>();
    for (const e of entries) {
      const g = groups.find((x) => x.materialId === e.materialId);
      if (!g) continue;
      byCur.set(e.currency, (byCur.get(e.currency) ?? 0) + g.totalQty * e.unitCost);
    }
    return [...byCur.entries()];
  }, [entries, groups]);

  const sections = GROUP_ORDER.map((k) => ({
    key: k,
    label: GROUP_LABEL[k],
    rows: groups.filter((g) => g.group === k),
  })).filter((s) => s.rows.length > 0);

  const setDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const useHints = () =>
    setDrafts((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        if (g.hintCost !== null && next[g.materialId]?.cost.trim() === "") {
          next[g.materialId] = { ...next[g.materialId], cost: String(g.hintCost) };
        }
      }
      return next;
    });

  const save = () => {
    setError(null);
    setNote(null);
    startSave(async () => {
      const res = await applyOpeningCosts(companyId, entries);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNote(
        `${res.updatedMaterials} malzeme, ${res.updatedLots} lot fiyatlandırıldı.`,
      );
      router.refresh();
    });
  };

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
        Maliyetsiz lot yok. Eldeki tüm lotların birim maliyeti girilmiş.
      </div>
    );
  }

  const hintCount = groups.filter((g) => g.hintCost !== null).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
        <div className="text-sm">
          <span className="font-medium">{groups.length}</span>{" "}
          <span className="text-muted-foreground">malzeme,</span>{" "}
          <span className="font-medium">
            {groups.reduce((s, g) => s + g.lots.length, 0)}
          </span>{" "}
          <span className="text-muted-foreground">maliyetsiz lot.</span>
          {entries.length > 0 ? (
            <span className="ml-2 text-muted-foreground">
              Girilen: <span className="font-medium text-foreground">{entries.length}</span>
              {totalValue.length > 0 ? (
                <>
                  {" "}
                  · Toplam stok değeri:{" "}
                  {totalValue.map(([cur, v]) => (
                    <span key={cur} className="font-medium text-foreground">
                      {money(v)} {cur}{" "}
                    </span>
                  ))}
                </>
              ) : null}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {hintCount > 0 && canManage ? (
            <Button variant="outline" size="sm" onClick={useHints} disabled={saving}>
              Son fiyatları doldur ({hintCount})
            </Button>
          ) : null}
          {canManage ? (
            <Button size="sm" onClick={save} disabled={saving || entries.length === 0}>
              {saving ? "Kaydediliyor..." : `Kaydet (${entries.length})`}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {note ? (
        <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
          {note}
        </p>
      ) : null}

      {sections.map((s) => (
        <section key={s.key} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {s.label}{" "}
            <span className="font-normal normal-case">({s.rows.length})</span>
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Kod</th>
                  <th className="px-3 py-2 text-left">Malzeme</th>
                  <th className="px-3 py-2 text-right">Eldeki</th>
                  <th className="px-3 py-2 text-right">Lot</th>
                  <th className="px-3 py-2 text-right">Son Fiyat</th>
                  <th className="px-3 py-2 text-left">Birim Maliyet</th>
                  <th className="px-3 py-2 text-left">Para</th>
                  <th className="px-3 py-2 text-right">Değer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {s.rows.map((g) => {
                  const d = drafts[g.materialId];
                  const v = Number((d?.cost ?? "").replace(",", "."));
                  const valid = d && d.cost.trim() !== "" && Number.isFinite(v) && v >= 0;
                  const expanded = open.has(g.materialId);
                  return (
                    <Fragment key={g.materialId}>
                      <tr className={cn(valid && "bg-primary/5")}>
                        <td className="px-3 py-2 font-mono text-xs">{g.code}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{g.name}</div>
                          <button
                            type="button"
                            onClick={() => toggle(g.materialId)}
                            className="text-xs text-muted-foreground hover:underline"
                          >
                            {expanded ? "Lotları gizle" : "Lotları göster"}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {nf(g.totalQty)} {g.uom}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {g.lots.length}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {g.hintCost !== null
                            ? `${money(g.hintCost)} ${g.hintCurrency ?? ""}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.0001"
                            min="0"
                            className="h-8 w-32 text-right tabular-nums"
                            placeholder={`₺ / ${g.uom}`}
                            value={d?.cost ?? ""}
                            disabled={!canManage || saving}
                            onChange={(e) =>
                              setDraft(g.materialId, { cost: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                            value={d?.currency ?? "TRY"}
                            disabled={!canManage || saving}
                            onChange={(e) =>
                              setDraft(g.materialId, {
                                currency: e.target.value as SupportedCurrency,
                              })
                            }
                          >
                            {SUPPORTED_CURRENCIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                          {valid ? `${money(g.totalQty * v)} ${d.currency}` : "—"}
                        </td>
                      </tr>
                      {expanded
                        ? g.lots.map((l) => (
                            <tr key={l.id} className="bg-secondary/20 text-xs">
                              <td className="px-3 py-1.5" />
                              <td className="px-3 py-1.5 font-mono text-muted-foreground">
                                {l.lotNumber}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                                {nf(l.qty)} {g.uom}
                              </td>
                              <td className="px-3 py-1.5 text-right text-muted-foreground">
                                {l.receivedAt}
                              </td>
                              <td colSpan={4} className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                                {valid ? `${money(l.qty * v)} ${d.currency}` : ""}
                              </td>
                            </tr>
                          ))
                        : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
