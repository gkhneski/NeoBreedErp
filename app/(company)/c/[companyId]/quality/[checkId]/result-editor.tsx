"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { QualityResultVerdict } from "@/types/database";

import {
  saveQualityCheckResults,
  type SaveResultsState,
} from "../actions";

interface ResultItem {
  id?: string;
  spec_name: string;
  spec_target: string;
  measured_value: string;
  verdict: QualityResultVerdict;
  notes: string;
}

interface ResultEditorProps {
  companyId: string;
  checkId: string;
  initialItems: ResultItem[];
}

const initialState: SaveResultsState = {};

const VERDICT_OPTIONS: Array<{ value: QualityResultVerdict; label: string }> = [
  { value: "pending", label: "Beklemede" },
  { value: "pass", label: "Geçti" },
  { value: "fail", label: "Kaldı" },
  { value: "na", label: "Uygulanmaz" },
];

export function QualityResultEditor({
  companyId,
  checkId,
  initialItems,
}: ResultEditorProps) {
  const [state, formAction] = useActionState(
    saveQualityCheckResults.bind(null, companyId),
    initialState,
  );
  const [items, setItems] = useState<ResultItem[]>(
    initialItems.length > 0
      ? initialItems
      : [
          {
            spec_name: "",
            spec_target: "",
            measured_value: "",
            verdict: "pending",
            notes: "",
          },
        ],
  );

  function updateItem<K extends keyof ResultItem>(
    idx: number,
    field: K,
    value: ResultItem[K],
  ) {
    setItems((arr) =>
      arr.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
    );
  }

  function addRow() {
    setItems((arr) => [
      ...arr,
      {
        spec_name: "",
        spec_target: "",
        measured_value: "",
        verdict: "pending",
        notes: "",
      },
    ]);
  }

  function removeRow(idx: number) {
    setItems((arr) =>
      arr.length === 1 ? arr : arr.filter((_, i) => i !== idx),
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="check_id" value={checkId} />

      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-sm font-semibold">Kontrol Sonuçları</h2>
          <p className="text-xs text-muted-foreground">
            Her satır için ölçüm değeri ve verdict girin. İmza için tüm satırlar
            doldurulmalı ve verdict &quot;Beklemede&quot; olmamalıdır.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          disabled={items.length >= 50}
        >
          Kalem Ekle
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">Spec</th>
              <th className="px-3 py-2 text-left font-medium">Hedef</th>
              <th className="px-3 py-2 text-left font-medium">Ölçüm</th>
              <th className="px-3 py-2 text-left font-medium">Verdict</th>
              <th className="px-3 py-2 text-left font-medium">Not</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} className="border-t border-border align-top">
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {idx + 1}
                </td>
                <td className="px-3 py-2">
                  <input type="hidden" name="row_id" value={item.id ?? ""} />
                  <Input
                    name="spec_name"
                    required
                    value={item.spec_name}
                    onChange={(e) =>
                      updateItem(idx, "spec_name", e.target.value)
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    name="spec_target"
                    value={item.spec_target}
                    onChange={(e) =>
                      updateItem(idx, "spec_target", e.target.value)
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    name="measured_value"
                    value={item.measured_value}
                    onChange={(e) =>
                      updateItem(idx, "measured_value", e.target.value)
                    }
                    placeholder="—"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    name="verdict"
                    value={item.verdict}
                    onChange={(e) =>
                      updateItem(
                        idx,
                        "verdict",
                        e.target.value as QualityResultVerdict,
                      )
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {VERDICT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <Textarea
                    name="row_notes"
                    rows={1}
                    value={item.notes}
                    onChange={(e) => updateItem(idx, "notes", e.target.value)}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    disabled={items.length === 1}
                    className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-40"
                  >
                    Sil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
          {state.message}
        </p>
      ) : null}

      <div>
        <SubmitButton variant="outline">Sonuçları Kaydet</SubmitButton>
      </div>
    </form>
  );
}
