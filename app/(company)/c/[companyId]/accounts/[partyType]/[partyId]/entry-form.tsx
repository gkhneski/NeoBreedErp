"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { addAccountEntry } from "../../actions";

type EntryKind = "payment" | "charge" | "adjustment";

export function AccountEntryForm({
  companyId,
  partyType,
  partyId,
}: {
  companyId: string;
  partyType: "customer" | "supplier";
  partyId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<EntryKind>("payment");
  const [amount, setAmount] = useState("");
  const [docNo, setDocNo] = useState("");
  const [docDate, setDocDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const chargeLabel = partyType === "customer" ? "Satış / Borç" : "Alış / Borç";

  function submit() {
    setMsg(null);
    const value = Number(amount.replace(",", "."));
    if (!Number.isFinite(value) || value === 0) {
      setMsg({ kind: "err", text: "Geçerli bir tutar girin." });
      return;
    }
    const apiKind =
      kind === "payment"
        ? "payment"
        : kind === "adjustment"
          ? "adjustment"
          : partyType === "customer"
            ? "sale"
            : "purchase";

    start(async () => {
      const res = await addAccountEntry({
        company: companyId,
        partyType,
        partyId,
        kind: apiKind,
        amount: value,
        docNo,
        docDate,
        notes,
      });
      if (!res.ok) {
        setMsg({ kind: "err", text: res.error });
        return;
      }
      setAmount("");
      setDocNo("");
      setNotes("");
      setMsg({ kind: "ok", text: res.note ?? "İşlendi." });
      router.refresh();
    });
  }

  const docRequired = kind === "payment";

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Cari Hareketi Ekle</h2>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="kind">Tür</Label>
          <select
            id="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as EntryKind)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="payment">Ödeme (bakiye düşer)</option>
            <option value="charge">{chargeLabel} (bakiye artar)</option>
            <option value="adjustment">Düzeltme (± tutar)</option>
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
          <Label htmlFor="docNo">Dekont No {docRequired ? "*" : ""}</Label>
          <Input id="docNo" value={docNo} onChange={(e) => setDocNo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="docDate">Tarih {docRequired ? "*" : ""}</Label>
          <Input
            id="docDate"
            type="date"
            value={docDate}
            onChange={(e) => setDocDate(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="notes">Açıklama</Label>
        <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {msg ? (
        <p className={`text-sm ${msg.kind === "ok" ? "text-emerald-600" : "text-destructive"}`}>
          {msg.text}
        </p>
      ) : null}
      <Button disabled={pending} onClick={submit}>
        {pending ? "İşleniyor..." : "Ekle"}
      </Button>
    </div>
  );
}
