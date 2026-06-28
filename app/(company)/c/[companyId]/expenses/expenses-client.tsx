"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { addExpense, deleteExpense } from "./actions";

export type ExpenseCat = "salary" | "electricity" | "water" | "fuel" | "rent" | "other";

export const CATEGORY_LABEL: Record<ExpenseCat, string> = {
  salary: "Maaş",
  electricity: "Elektrik",
  water: "Su",
  fuel: "Akaryakıt",
  rent: "Kira",
  other: "Diğer",
};

export function ExpenseForm({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [category, setCategory] = useState<ExpenseCat>("salary");
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function submit() {
    setMsg(null);
    const value = Number(amount.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      setMsg({ kind: "err", text: "Geçerli bir tutar girin." });
      return;
    }
    start(async () => {
      const res = await addExpense({ company: companyId, category, amount: value, month, notes });
      if (!res.ok) {
        setMsg({ kind: "err", text: res.error });
        return;
      }
      setAmount("");
      setNotes("");
      setMsg({ kind: "ok", text: res.note ?? "Eklendi." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Gider Ekle</h2>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="category">Kategori</Label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCat)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {(Object.keys(CATEGORY_LABEL) as ExpenseCat[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="amount">Tutar (₺)</Label>
          <Input
            id="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="month">Ay</Label>
          <Input id="month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Açıklama</Label>
          <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      {msg ? (
        <p className={`text-sm ${msg.kind === "ok" ? "text-emerald-600" : "text-destructive"}`}>
          {msg.text}
        </p>
      ) : null}
      <Button disabled={pending} onClick={submit}>
        {pending ? "Ekleniyor..." : "Ekle"}
      </Button>
    </div>
  );
}

export function DeleteExpenseButton({
  companyId,
  expenseId,
}: {
  companyId: string;
  expenseId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Gider silinsin mi?")) return;
        start(async () => {
          await deleteExpense(companyId, expenseId);
          router.refresh();
        });
      }}
      className="text-muted-foreground hover:text-destructive"
      title="Sil"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
