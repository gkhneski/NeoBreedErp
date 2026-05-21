"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  uploadAttachment,
  type UploadAttachmentState,
} from "@/app/(company)/c/[companyId]/files/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  FileAttachmentKind,
  FileAttachmentSubjectKind,
} from "@/types/database";

interface KindOption {
  value: FileAttachmentKind;
  label: string;
}

interface AttachmentUploaderProps {
  companyId: string;
  subjectKind: FileAttachmentSubjectKind;
  subjectId: string;
  kindOptions: KindOption[];
  defaultKind: FileAttachmentKind;
  acceptMime: string;
  maxBytes: number;
}

const INITIAL: UploadAttachmentState = {};

function formatMb(maxBytes: number): string {
  return `${Math.round(maxBytes / (1024 * 1024))} MB`;
}

export function AttachmentUploader({
  companyId,
  subjectKind,
  subjectId,
  kindOptions,
  defaultKind,
  acceptMime,
  maxBytes,
}: AttachmentUploaderProps) {
  const [state, formAction, isPending] = useActionState(
    uploadAttachment.bind(null, companyId),
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
    }
  }, [state.ok]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-md border border-border bg-card/40 p-4"
    >
      <input type="hidden" name="subject_kind" value={subjectKind} />
      <input type="hidden" name="subject_id" value={subjectId} />

      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <div className="space-y-1">
          <Label htmlFor="file">Dosya</Label>
          <Input
            id="file"
            name="file"
            type="file"
            accept={acceptMime}
            required
          />
          <p className="text-xs text-muted-foreground">
            PDF, JPG, PNG veya WEBP — en fazla {formatMb(maxBytes)}.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="kind">Tür</Label>
          <select
            id="kind"
            name="kind"
            defaultValue={defaultKind}
            className="flex h-9 w-full rounded-md border border-border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {kindOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">Not (opsiyonel)</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={2}
          maxLength={2000}
          placeholder="Örn. Tedarikçi CoA, parti 2026-04-12"
        />
      </div>

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600">
          Dosya yüklendi.
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Yükleniyor…" : "Yükle"}
        </Button>
      </div>
    </form>
  );
}
