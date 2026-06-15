"use client";

import { Check, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { correctLotQuantity } from "./actions";

export function LotQuantityEditor({
  companyId,
  lotId,
  current,
  uom,
}: {
  companyId: string;
  lotId: string;
  current: number;
  uom: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(Math.round(current)));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const next = Number(value.replace(",", "."));
    setError(null);
    startTransition(async () => {
      const res = await correctLotQuantity(companyId, lotId, next);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(String(Math.round(current)));
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-emerald-500/50 hover:text-emerald-600"
      >
        <Pencil className="h-3 w-3" />
        Düzelt
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <input
          type="number"
          step="1"
          min="0"
          autoFocus
          value={value}
          disabled={pending}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setOpen(false);
          }}
          className="h-8 w-24 rounded-md border border-input bg-background px-2 text-right text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-[10px] text-muted-foreground">{uom}</span>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          aria-label="Kaydet"
          className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          aria-label="İptal"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {error ? <p className="text-[10px] text-destructive">{error}</p> : null}
    </div>
  );
}
