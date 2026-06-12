"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  uploadAttachment,
  type UploadAttachmentState,
} from "@/app/(company)/c/[companyId]/files/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const INITIAL: UploadAttachmentState = {};

type LotOption = {
  id: string;
  lot_number: string;
  quantity_on_hand: number;
};

export function MaterialCertificateUploader({
  companyId,
  lots,
}: {
  companyId: string;
  lots: LotOption[];
}) {
  const [state, formAction] = useActionState(
    uploadAttachment.bind(null, companyId),
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  if (lots.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-card/40 px-3 py-4 text-xs text-muted-foreground">
        Sertifika yüklemek için önce bu malzeme için lot açin.
      </p>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-md border border-border bg-card/40 p-4"
    >
      <input type="hidden" name="subject_kind" value="material_lot" />
      <input type="hidden" name="kind" value="coa" />

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
        <div className="space-y-1">
          <Label htmlFor="subject_id">Lot *</Label>
          <select
            id="subject_id"
            name="subject_id"
            required
            defaultValue=""
            className="flex h-9 w-full rounded-md border border-border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="" disabled>
              -- Seçiniz --
            </option>
            {lots.map((lot) => (
              <option key={lot.id} value={lot.id}>
                {lot.lot_number} ({Number(lot.quantity_on_hand)})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="file">Dosya *</Label>
          <Input
            id="file"
            name="file"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            required
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">Not</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={2}
          placeholder="Örn. Tedarikçi CoA, analiz tarihi, rapor no"
        />
      </div>

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600">
          Sertifika yüklendi.
        </p>
      ) : null}

      <SubmitButton size="sm" pendingLabel="Yükleniyor...">Analiz Sertifikası Yükle</SubmitButton>
    </form>
  );
}
