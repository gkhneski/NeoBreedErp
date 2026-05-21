"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyUser } from "@/lib/auth";
import {
  TENANT_FILES_BUCKET,
  buildStoragePath,
  getSurfaceConfig,
  isAllowedKindForSubject,
  isAllowedMime,
} from "@/lib/storage/attachments";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { FileAttachmentSubjectKind } from "@/types/database";
import { companyModulePath } from "@/types/roles";

const uploadSchema = z.object({
  subject_kind: z.enum(["material_lot", "quality_check"]),
  subject_id: z.string().uuid({ message: "Konu seçiniz." }),
  kind: z.string().trim().min(1),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

const deleteSchema = z.object({
  attachment_id: z.string().uuid(),
});

export type UploadAttachmentState = {
  error?: string;
  ok?: boolean;
};

async function verifySubjectInCompany(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  subjectKind: FileAttachmentSubjectKind,
  subjectId: string,
  companyId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (subjectKind === "material_lot") {
    const { data } = await supabase
      .from("material_lots")
      .select("id, company_id, deleted_at")
      .eq("id", subjectId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!data || data.deleted_at) {
      return { ok: false, reason: "Lot bulunamadı." };
    }
    return { ok: true };
  }
  const { data } = await supabase
    .from("quality_checks")
    .select("id, company_id, status, deleted_at")
    .eq("id", subjectId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data || data.deleted_at) {
    return { ok: false, reason: "QC kaydı bulunamadı." };
  }
  if (data.status !== "draft") {
    return {
      ok: false,
      reason: "İmzalanmış veya iptal edilmiş QC kaydına dosya eklenemez.",
    };
  }
  return { ok: true };
}

function revalidateSubject(
  companyId: string,
  subjectKind: FileAttachmentSubjectKind,
  subjectId: string,
) {
  if (subjectKind === "material_lot") {
    revalidatePath(`${companyModulePath(companyId, "lots")}/${subjectId}`);
    revalidatePath(companyModulePath(companyId, "lots"));
  } else {
    revalidatePath(`${companyModulePath(companyId, "quality")}/${subjectId}`);
    revalidatePath(companyModulePath(companyId, "quality"));
  }
}

export async function uploadAttachment(
  routeCompanyId: string,
  _prev: UploadAttachmentState,
  formData: FormData,
): Promise<UploadAttachmentState> {
  const parsed = uploadSchema.safeParse({
    subject_kind: formData.get("subject_kind") ?? "",
    subject_id: formData.get("subject_id") ?? "",
    kind: formData.get("kind") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Form geçersiz." };
  }

  const subjectKind = parsed.data.subject_kind as FileAttachmentSubjectKind;
  if (!isAllowedKindForSubject(subjectKind, parsed.data.kind)) {
    return { error: "Bu konu için geçersiz dosya türü." };
  }
  const kind = parsed.data.kind;
  const surface = getSurfaceConfig(subjectKind);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Bir dosya seçiniz." };
  }

  if (!isAllowedMime(file.type) || !surface.allowedMime.includes(file.type)) {
    return { error: "Yalnızca PDF, JPG, PNG ve WEBP kabul edilir." };
  }

  if (file.size > surface.maxBytes) {
    return {
      error: `Dosya en fazla ${Math.round(surface.maxBytes / (1024 * 1024))} MB olabilir.`,
    };
  }

  const { ctx, companyId } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const subjectCheck = await verifySubjectInCompany(
    supabase,
    subjectKind,
    parsed.data.subject_id,
    companyId,
  );
  if (!subjectCheck.ok) {
    return { error: subjectCheck.reason };
  }

  const { storagePath, attachmentId } = buildStoragePath({
    companyId,
    subjectKind,
    subjectId: parsed.data.subject_id,
    originalFileName: file.name,
    mimeType: file.type,
  });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage
    .from(TENANT_FILES_BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadErr) {
    return { error: `Yükleme başarısız: ${uploadErr.message}` };
  }

  const insertPayload = {
    id: attachmentId,
    company_id: companyId,
    subject_kind: subjectKind,
    material_lot_id:
      subjectKind === "material_lot" ? parsed.data.subject_id : null,
    quality_check_id:
      subjectKind === "quality_check" ? parsed.data.subject_id : null,
    kind,
    storage_path: storagePath,
    file_name: file.name.slice(0, 255),
    mime_type: file.type,
    size_bytes: file.size,
    notes: parsed.data.notes,
    created_by: ctx.userId,
  };

  const { error: insertErr } = await supabase
    .from("file_attachments")
    .insert(insertPayload);

  if (insertErr) {
    await supabase.storage.from(TENANT_FILES_BUCKET).remove([storagePath]);
    return { error: `Kayıt başarısız: ${insertErr.message}` };
  }

  revalidateSubject(companyId, subjectKind, parsed.data.subject_id);
  return { ok: true };
}

export async function deleteAttachment(
  routeCompanyId: string,
  formData: FormData,
): Promise<void> {
  const parsed = deleteSchema.safeParse({
    attachment_id: formData.get("attachment_id") ?? "",
  });
  if (!parsed.success) return;

  const { companyId } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const { data: row } = await supabase
    .from("file_attachments")
    .select(
      "id, company_id, subject_kind, material_lot_id, quality_check_id, storage_path",
    )
    .eq("id", parsed.data.attachment_id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!row) return;

  if (row.subject_kind === "quality_check" && row.quality_check_id) {
    const { data: check } = await supabase
      .from("quality_checks")
      .select("status")
      .eq("id", row.quality_check_id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (check && check.status !== "draft") {
      return;
    }
  }

  await supabase
    .from("file_attachments")
    .delete()
    .eq("id", row.id)
    .eq("company_id", companyId);

  await supabase.storage
    .from(TENANT_FILES_BUCKET)
    .remove([row.storage_path]);

  const subjectId =
    row.subject_kind === "material_lot"
      ? row.material_lot_id
      : row.quality_check_id;
  if (subjectId) {
    revalidateSubject(
      companyId,
      row.subject_kind as FileAttachmentSubjectKind,
      subjectId,
    );
  }
}
