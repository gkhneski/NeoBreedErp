import "server-only";

import { randomUUID } from "node:crypto";

import type {
  FileAttachmentKind,
  FileAttachmentSubjectKind,
} from "@/types/database";

export const TENANT_FILES_BUCKET = "tenant-files";
export const SIGNED_URL_TTL_SECONDS = 600;
export const MAX_FILE_BYTES_DEFAULT = 10 * 1024 * 1024;

const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

type AllowedMime = (typeof ALLOWED_MIME)[number];

export type SubjectDomain = "lots" | "quality";

interface SurfaceConfig {
  domain: SubjectDomain;
  allowedKinds: readonly FileAttachmentKind[];
  defaultKind: FileAttachmentKind;
  allowedMime: readonly string[];
  maxBytes: number;
}

const SURFACE: Record<FileAttachmentSubjectKind, SurfaceConfig> = {
  material_lot: {
    domain: "lots",
    allowedKinds: ["coa", "msds", "invoice", "other"],
    defaultKind: "coa",
    allowedMime: ALLOWED_MIME,
    maxBytes: MAX_FILE_BYTES_DEFAULT,
  },
  quality_check: {
    domain: "quality",
    allowedKinds: ["lab_report", "other"],
    defaultKind: "lab_report",
    allowedMime: ALLOWED_MIME,
    maxBytes: MAX_FILE_BYTES_DEFAULT,
  },
};

export function getSurfaceConfig(
  subjectKind: FileAttachmentSubjectKind,
): SurfaceConfig {
  return SURFACE[subjectKind];
}

export function isAllowedKindForSubject(
  subjectKind: FileAttachmentSubjectKind,
  kind: string,
): kind is FileAttachmentKind {
  return SURFACE[subjectKind].allowedKinds.includes(kind as FileAttachmentKind);
}

export function isAllowedMime(mime: string): mime is AllowedMime {
  return (ALLOWED_MIME as readonly string[]).includes(mime);
}

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extensionForMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? "bin";
}

export function slugifyFilename(input: string): string {
  const dot = input.lastIndexOf(".");
  const base = dot > 0 ? input.slice(0, dot) : input;
  return (
    base
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "file"
  );
}

export function buildStoragePath(args: {
  companyId: string;
  subjectKind: FileAttachmentSubjectKind;
  subjectId: string;
  originalFileName: string;
  mimeType: string;
}): { storagePath: string; storedFileName: string; attachmentId: string } {
  const { companyId, subjectKind, subjectId, originalFileName, mimeType } =
    args;
  const cfg = getSurfaceConfig(subjectKind);
  const attachmentId = randomUUID();
  const slug = slugifyFilename(originalFileName);
  const ext = extensionForMime(mimeType);
  const storedFileName = `${attachmentId}-${slug}.${ext}`;
  const storagePath = `${companyId}/${cfg.domain}/${subjectId}/${storedFileName}`;
  return { storagePath, storedFileName, attachmentId };
}

export const ATTACHMENT_KIND_LABEL: Record<FileAttachmentKind, string> = {
  coa: "Analiz Sertifikası (CoA)",
  msds: "Güvenlik Bilgi Formu (MSDS)",
  invoice: "Fatura",
  lab_report: "Laboratuvar Raporu",
  other: "Diğer",
};

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const decimals = unit === 0 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[unit]}`;
}
