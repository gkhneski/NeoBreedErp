import Link from "next/link";
import { notFound } from "next/navigation";

import { AttachmentList } from "@/components/files/attachment-list";
import { AttachmentUploader } from "@/components/files/attachment-uploader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth";
import {
  ATTACHMENT_KIND_LABEL,
  getSurfaceConfig,
} from "@/lib/storage/attachments";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  FileAttachment,
  QualityCheckStatus,
  QualityCheckSubjectKind,
  QualityResultVerdict,
} from "@/types/database";
import { companyModulePath } from "@/types/roles";

import { cancelQualityCheck } from "../actions";
import { QualityResultEditor } from "./result-editor";
import { SignForm } from "./sign-form";

interface PageProps {
  params: Promise<{ companyId: string; checkId: string }>;
}

type CheckRow = {
  id: string;
  code: string;
  subject_kind: QualityCheckSubjectKind;
  status: QualityCheckStatus;
  signed_at: string | null;
  signed_by: string | null;
  notes: string | null;
  material_lot_id: string | null;
  production_batch_id: string | null;
  created_at: string;
  material_lots:
    | {
        id: string;
        lot_number: string;
        status: "quarantine" | "released" | "blocked";
        expiry_date: string | null;
        materials: { code: string; name: string } | null;
      }
    | null;
  production_batches:
    | {
        id: string;
        batch_number: string;
        status: string;
        actual_quantity: number | null;
        uom: string;
        output_lot_id: string | null;
        production_orders: { code: string } | null;
        material_lots:
          | {
              lot_number: string;
              status: "quarantine" | "released" | "blocked";
            }
          | null;
      }
    | null;
};

type ResultRow = {
  id: string;
  position: number;
  spec_name: string;
  spec_target: string | null;
  measured_value: string | null;
  verdict: QualityResultVerdict;
  notes: string | null;
};

const STATUS_LABEL: Record<QualityCheckStatus, string> = {
  draft: "Taslak",
  passed: "Geçti",
  failed: "Kaldı",
  cancelled: "İptal",
};

const STATUS_VARIANT: Record<
  QualityCheckStatus,
  "default" | "secondary" | "outline" | "warning" | "destructive" | "success"
> = {
  draft: "outline",
  passed: "success",
  failed: "destructive",
  cancelled: "secondary",
};

const LOT_STATUS_LABEL: Record<"quarantine" | "released" | "blocked", string> = {
  quarantine: "Karantina",
  released: "Serbest",
  blocked: "Bloklu",
};

const LOT_STATUS_VARIANT: Record<
  "quarantine" | "released" | "blocked",
  "default" | "warning" | "destructive"
> = {
  quarantine: "warning",
  released: "default",
  blocked: "destructive",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default async function QualityCheckDetailPage({ params }: PageProps) {
  const { companyId: routeCompanyId, checkId } = await params;
  const { companyId } = await requireModuleAccess(routeCompanyId, "quality");
  const supabase = await createServerSupabaseClient();

  const { data: check } = await supabase
    .from("quality_checks")
    .select(
      "id, code, subject_kind, status, signed_at, signed_by, notes, " +
        "material_lot_id, production_batch_id, created_at, " +
        "material_lots:material_lot_id(id, lot_number, status, expiry_date, materials:material_id(code, name)), " +
        "production_batches:production_batch_id(id, batch_number, status, actual_quantity, uom, output_lot_id, " +
        "production_orders:production_order_id(code), " +
        "material_lots:output_lot_id(lot_number, status))",
    )
    .eq("id", checkId)
    .eq("company_id", companyId)
    .maybeSingle<CheckRow>();

  if (!check) notFound();

  const { data: results } = await supabase
    .from("quality_check_results")
    .select("id, position, spec_name, spec_target, measured_value, verdict, notes")
    .eq("quality_check_id", check.id)
    .eq("company_id", companyId)
    .order("position", { ascending: true })
    .returns<ResultRow[]>();

  const { data: attachments } = await supabase
    .from("file_attachments")
    .select(
      "id, company_id, subject_kind, material_lot_id, quality_check_id, kind, storage_path, file_name, mime_type, size_bytes, notes, created_at, created_by",
    )
    .eq("quality_check_id", check.id)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .returns<FileAttachment[]>();

  const rows = results ?? [];
  const listHref = companyModulePath(companyId, "quality");
  const isDraft = check.status === "draft";

  const qcSurface = getSurfaceConfig("quality_check");
  const qcKindOptions = qcSurface.allowedKinds.map((k) => ({
    value: k,
    label: ATTACHMENT_KIND_LABEL[k],
  }));

  const subjectBlock = (() => {
    if (check.subject_kind === "material_lot" && check.material_lots) {
      const lot = check.material_lots;
      const lotHref = companyModulePath(companyId, "lots");
      return (
        <div className="space-y-1 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Hammadde Lotu
          </div>
          <div className="flex items-center gap-2">
            <Link href={lotHref} className="font-mono text-sm hover:underline">
              {lot.lot_number}
            </Link>
            {lot.materials ? (
              <span className="text-muted-foreground">
                — {lot.materials.code} ({lot.materials.name})
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant={LOT_STATUS_VARIANT[lot.status]}>
              {LOT_STATUS_LABEL[lot.status]}
            </Badge>
            {lot.expiry_date ? (
              <span className="text-muted-foreground">SKT {lot.expiry_date}</span>
            ) : null}
          </div>
        </div>
      );
    }
    if (check.subject_kind === "production_batch" && check.production_batches) {
      const batch = check.production_batches;
      const orderHref = companyModulePath(companyId, "production");
      return (
        <div className="space-y-1 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Üretim Partisi
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">{batch.batch_number}</span>
            {batch.production_orders ? (
              <Link
                href={orderHref}
                className="text-muted-foreground hover:underline"
              >
                — {batch.production_orders.code}
              </Link>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              Parti durumu:{" "}
              {{
                in_progress: "Üretimde",
                completed: "Tamamlandı",
                closed: "Kapatıldı",
                cancelled: "İptal",
              }[batch.status] ?? batch.status}
            </span>
            {batch.actual_quantity !== null ? (
              <span>
                · {Number(batch.actual_quantity)} {batch.uom}
              </span>
            ) : null}
          </div>
          {batch.material_lots ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Çıkış lotu:</span>
              <span className="font-mono">
                {batch.material_lots.lot_number}
              </span>
              <Badge variant={LOT_STATUS_VARIANT[batch.material_lots.status]}>
                {LOT_STATUS_LABEL[batch.material_lots.status]}
              </Badge>
            </div>
          ) : null}
        </div>
      );
    }
    return null;
  })();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href={listHref}
              className="text-xs text-muted-foreground hover:underline"
            >
              Kalite Kontrol
            </Link>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="font-mono text-sm">{check.code}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            QC Kaydı — {check.code}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={STATUS_VARIANT[check.status]}>
              {STATUS_LABEL[check.status]}
            </Badge>
            <span>Oluşturuldu: {formatDateTime(check.created_at)}</span>
            {check.signed_at ? (
              <span>İmza: {formatDateTime(check.signed_at)}</span>
            ) : null}
          </div>
        </div>
        {isDraft ? (
          <form action={cancelQualityCheck.bind(null, companyId)}>
            <input type="hidden" name="check_id" value={check.id} />
            <Button type="submit" variant="outline">
              Taslağı İptal Et
            </Button>
          </form>
        ) : null}
      </header>

      <section className="rounded-md border border-border bg-card/40 p-4">
        {subjectBlock}
        {check.notes ? (
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
            {check.notes}
          </p>
        ) : null}
      </section>

      {isDraft ? (
        <QualityResultEditor
          companyId={companyId}
          checkId={check.id}
          initialItems={rows.map((r) => ({
            id: r.id,
            spec_name: r.spec_name,
            spec_target: r.spec_target ?? "",
            measured_value: r.measured_value ?? "",
            verdict: r.verdict,
            notes: r.notes ?? "",
          }))}
        />
      ) : (
        <FrozenResultsTable rows={rows} />
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">Ekli Dosyalar</h2>
          <p className="text-xs text-muted-foreground">
            Laboratuvar raporları ve destekleyici belgeler. Yalnızca taslak
            kayıtlara yükleme yapılabilir.
          </p>
        </div>
        <AttachmentList
          companyId={companyId}
          rows={attachments ?? []}
          canDelete={isDraft}
        />
        {isDraft ? (
          <AttachmentUploader
            companyId={companyId}
            subjectKind="quality_check"
            subjectId={check.id}
            kindOptions={qcKindOptions}
            defaultKind={qcSurface.defaultKind}
            acceptMime={qcSurface.allowedMime.join(",")}
            maxBytes={qcSurface.maxBytes}
          />
        ) : null}
      </section>

      {isDraft ? (
        <SignForm companyId={companyId} checkId={check.id} />
      ) : (
        <SignedSummary
          status={check.status}
          subjectKind={check.subject_kind}
          batchOutputStatus={
            check.production_batches?.material_lots?.status ?? null
          }
          lotStatus={check.material_lots?.status ?? null}
        />
      )}
    </div>
  );
}

function FrozenResultsTable({ rows }: { rows: ResultRow[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Kontrol Sonuçları (dondurulmuş)</h2>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">Spec</th>
              <th className="px-3 py-2 text-left font-medium">Hedef</th>
              <th className="px-3 py-2 text-left font-medium">Ölçüm</th>
              <th className="px-3 py-2 text-left font-medium">Verdict</th>
              <th className="px-3 py-2 text-left font-medium">Not</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {r.position}
                </td>
                <td className="px-3 py-2">{r.spec_name}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {r.spec_target ?? "—"}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {r.measured_value ?? "—"}
                </td>
                <td className="px-3 py-2 text-xs">
                  <VerdictBadge verdict={r.verdict} />
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {r.notes ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function VerdictBadge({ verdict }: { verdict: QualityResultVerdict }) {
  const map: Record<
    QualityResultVerdict,
    { label: string; variant: "default" | "secondary" | "warning" | "destructive" | "success" }
  > = {
    pending: { label: "Beklemede", variant: "warning" },
    pass: { label: "Geçti", variant: "success" },
    fail: { label: "Kaldı", variant: "destructive" },
    na: { label: "Uygulanmaz", variant: "secondary" },
  };
  const entry = map[verdict];
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

function SignedSummary({
  status,
  subjectKind,
  lotStatus,
  batchOutputStatus,
}: {
  status: QualityCheckStatus;
  subjectKind: QualityCheckSubjectKind;
  lotStatus: "quarantine" | "released" | "blocked" | null;
  batchOutputStatus: "quarantine" | "released" | "blocked" | null;
}) {
  if (status === "cancelled") {
    return (
      <p className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
        Bu QC kaydı iptal edildi. Konunun durumu değişmedi.
      </p>
    );
  }
  const reflected =
    subjectKind === "material_lot" ? lotStatus : batchOutputStatus;
  return (
    <p className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
      İmza tamam. {subjectKind === "material_lot" ? "Lot" : "Çıkış lotu"} durumu:{" "}
      <span className="font-medium">{reflected ?? "—"}</span>.
      {status === "passed" && subjectKind === "production_batch"
        ? " Parti kapatıldı."
        : null}
    </p>
  );
}
