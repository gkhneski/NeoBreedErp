import "server-only";

import {
  ATTACHMENT_KIND_LABEL,
  SIGNED_URL_TTL_SECONDS,
  TENANT_FILES_BUCKET,
  formatBytes,
} from "@/lib/storage/attachments";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { FileAttachment } from "@/types/database";

import { DeleteAttachmentForm } from "./delete-attachment-form";

interface AttachmentListProps {
  companyId: string;
  rows: FileAttachment[];
  canDelete: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export async function AttachmentList({
  companyId,
  rows,
  canDelete,
}: AttachmentListProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-card/40 px-3 py-4 text-xs text-muted-foreground">
        Henüz dosya yok.
      </p>
    );
  }

  const supabase = await createServerSupabaseClient();
  const paths = rows.map((r) => r.storage_path);
  const { data: signed } = await supabase.storage
    .from(TENANT_FILES_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  const urlByPath = new Map<string, string>();
  for (const entry of signed ?? []) {
    if (entry?.path && entry.signedUrl) {
      urlByPath.set(entry.path, entry.signedUrl);
    }
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Dosya</th>
            <th className="px-3 py-2 text-left font-medium">Tür</th>
            <th className="px-3 py-2 text-right font-medium">Boyut</th>
            <th className="px-3 py-2 text-left font-medium">Yüklendi</th>
            {canDelete ? <th className="px-3 py-2" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = urlByPath.get(row.storage_path);
            return (
              <tr key={row.id} className="border-t border-border align-top">
                <td className="px-3 py-2">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {row.file_name}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">{row.file_name}</span>
                  )}
                  {row.notes ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {row.notes}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {ATTACHMENT_KIND_LABEL[row.kind]}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {formatBytes(Number(row.size_bytes))}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {formatDate(row.created_at)}
                </td>
                {canDelete ? (
                  <td className="px-3 py-2 text-right">
                    <DeleteAttachmentForm
                      companyId={companyId}
                      attachmentId={row.id}
                    />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
