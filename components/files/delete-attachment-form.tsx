"use client";

import { deleteAttachment } from "@/app/(company)/c/[companyId]/files/actions";

interface Props {
  companyId: string;
  attachmentId: string;
}

export function DeleteAttachmentForm({ companyId, attachmentId }: Props) {
  return (
    <form
      action={deleteAttachment.bind(null, companyId)}
      onSubmit={(event) => {
        if (!window.confirm("Bu dosyayı silmek istediğinize emin misiniz?")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="attachment_id" value={attachmentId} />
      <button
        type="submit"
        className="rounded-sm border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        Sil
      </button>
    </form>
  );
}
