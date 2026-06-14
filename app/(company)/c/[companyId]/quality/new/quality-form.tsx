"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { companyModulePath } from "@/types/roles";

import {
  createQualityCheck,
  type CreateQualityCheckState,
} from "../actions";

export interface SubjectOption {
  id: string;
  label: string;
}

interface QualityCheckFormProps {
  companyId: string;
  defaultCode: string;
  lots: SubjectOption[];
  batches: SubjectOption[];
}

const STARTER_LOT_SPECS = [
  { spec_name: "Görsel inceleme", spec_target: "Spec'e uygun" },
  { spec_name: "Ambalaj bütünlüğü", spec_target: "Hasarsız" },
  { spec_name: "Etiket / lot eşleşmesi", spec_target: "Uyumlu" },
];

const STARTER_BATCH_SPECS = [
  { spec_name: "Görsel inceleme", spec_target: "Spec'e uygun" },
  { spec_name: "Net dolum miktarı", spec_target: "Beyan ± toleransta" },
  { spec_name: "Ambalaj bütünlüğü", spec_target: "Hasarsız" },
];

const initialState: CreateQualityCheckState = {};

export function QualityCheckForm({
  companyId,
  defaultCode,
  lots,
  batches,
}: QualityCheckFormProps) {
  const [state, formAction] = useActionState(
    createQualityCheck.bind(null, companyId),
    initialState,
  );
  const cancelHref = companyModulePath(companyId, "quality");

  const initialKind: "material_lot" | "production_batch" =
    lots.length > 0 ? "material_lot" : "production_batch";
  const [kind, setKind] = useState<"material_lot" | "production_batch">(
    initialKind,
  );
  const [items, setItems] = useState<
    Array<{ spec_name: string; spec_target: string }>
  >(
    initialKind === "material_lot"
      ? STARTER_LOT_SPECS.map((s) => ({ ...s }))
      : STARTER_BATCH_SPECS.map((s) => ({ ...s })),
  );

  function onKindChange(next: "material_lot" | "production_batch") {
    setKind(next);
    setItems(
      next === "material_lot"
        ? STARTER_LOT_SPECS.map((s) => ({ ...s }))
        : STARTER_BATCH_SPECS.map((s) => ({ ...s })),
    );
  }

  function updateItem(
    idx: number,
    field: "spec_name" | "spec_target",
    value: string,
  ) {
    setItems((arr) =>
      arr.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
    );
  }

  function addRow() {
    setItems((arr) => [...arr, { spec_name: "", spec_target: "" }]);
  }

  function removeRow(idx: number) {
    setItems((arr) => arr.filter((_, i) => i !== idx));
  }

  const subjectOptions = kind === "material_lot" ? lots : batches;

  return (
    <form action={formAction} className="space-y-6">
      <section className="grid gap-4 rounded-md border border-border bg-card/40 p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="code">QC Kodu *</Label>
          <Input id="code" name="code" required defaultValue={defaultCode} />
          {state.fieldErrors?.code ? (
            <p className="text-xs text-destructive">{state.fieldErrors.code}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label>Konu Türü *</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onKindChange("material_lot")}
              disabled={lots.length === 0}
              className={
                kind === "material_lot"
                  ? "rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs text-background"
                  : "rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-50"
              }
            >
              Hammadde Lotu
            </button>
            <button
              type="button"
              onClick={() => onKindChange("production_batch")}
              disabled={batches.length === 0}
              className={
                kind === "production_batch"
                  ? "rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs text-background"
                  : "rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-50"
              }
            >
              Üretim Partisi
            </button>
          </div>
          <input type="hidden" name="subject_kind" value={kind} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="subject_id">
            {kind === "material_lot"
              ? "Karantinadaki Lot *"
              : "Tamamlanmış Parti *"}
          </Label>
          <select
            id="subject_id"
            name="subject_id"
            required
            defaultValue=""
            className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="" disabled>
              — Seçiniz —
            </option>
            {subjectOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          {state.fieldErrors?.subject_id ? (
            <p className="text-xs text-destructive">
              {state.fieldErrors.subject_id}
            </p>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-sm font-semibold">Kontrol Listesi</h2>
            <p className="text-xs text-muted-foreground">
              Konuya göre başlangıç önerileri eklendi. İhtiyacınıza göre
              düzenleyin. Ölçüm değerleri ve verdict bir sonraki ekranda
              girilir.
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

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">Spec Adı</th>
                <th className="px-3 py-2 text-left font-medium">Hedef</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const nameErr =
                  state.fieldErrors?.items?.[`${idx}.spec_name`];
                return (
                  <tr key={idx} className="border-t border-border align-top">
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        name="spec_name"
                        required
                        value={item.spec_name}
                        onChange={(e) =>
                          updateItem(idx, "spec_name", e.target.value)
                        }
                        placeholder="örn. Görsel inceleme"
                      />
                      {nameErr ? (
                        <p className="mt-1 text-xs text-destructive">
                          {nameErr}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        name="spec_target"
                        value={item.spec_target}
                        onChange={(e) =>
                          updateItem(idx, "spec_target", e.target.value)
                        }
                        placeholder="örn. ≤ 5, renksiz, negatif"
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
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-1.5">
        <Label htmlFor="notes">Notlar</Label>
        <Textarea id="notes" name="notes" rows={3} />
      </section>

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <SubmitButton pendingLabel="Oluşturuluyor...">QC Aç</SubmitButton>
        <Link href={cancelHref}>
          <Button type="button" variant="outline">
            İptal
          </Button>
        </Link>
      </div>
    </form>
  );
}
