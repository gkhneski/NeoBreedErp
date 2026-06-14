import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireModuleAccess } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  QualityCheckStatus,
  QualityCheckSubjectKind,
} from "@/types/database";
import {
  QUALITY_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type CheckRow = {
  id: string;
  code: string;
  subject_kind: QualityCheckSubjectKind;
  status: QualityCheckStatus;
  signed_at: string | null;
  notes: string | null;
  updated_at: string;
  material_lots:
    | {
        lot_number: string;
        materials: { code: string; name: string } | null;
      }
    | null;
  production_batches:
    | {
        batch_number: string;
        production_orders: { code: string } | null;
      }
    | null;
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

const SUBJECT_LABEL: Record<QualityCheckSubjectKind, string> = {
  material_lot: "Hammadde Lotu",
  production_batch: "Üretim Partisi",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default async function QualityListPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireModuleAccess(routeCompanyId, "quality");
  const supabase = await createServerSupabaseClient();

  const { data: checks } = await supabase
    .from("quality_checks")
    .select(
      "id, code, subject_kind, status, signed_at, notes, updated_at, " +
        "material_lots:material_lot_id(lot_number, materials:material_id(code, name)), " +
        "production_batches:production_batch_id(batch_number, production_orders:production_order_id(code))",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .returns<CheckRow[]>();

  const rows = checks ?? [];
  const newHref = companyModulePath(companyId, "quality", "new");

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Kalite Kontrol</h1>
          <p className="text-sm text-muted-foreground">
            Karantinadaki hammadde lotları ve tamamlanmış üretim partileri için QC
            kayıtları. İmza, lotun durumunu &quot;Serbest&quot; veya
            &quot;Bloklu&quot;ya çevirir; partide ek olarak partiyi kapatır.
          </p>
        </div>
        {canWriteCompanyData(role, QUALITY_WRITE_ROLES) ? (
          <Link href={newHref}>
            <Button>Yeni QC</Button>
          </Link>
        ) : null}
      </header>

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Kod</th>
                <th className="px-3 py-2 text-left font-medium">Konu</th>
                <th className="px-3 py-2 text-left font-medium">Referans</th>
                <th className="px-3 py-2 text-left font-medium">İmza</th>
                <th className="px-3 py-2 text-left font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const lotRef =
                  row.subject_kind === "material_lot" && row.material_lots
                    ? `${row.material_lots.lot_number}${
                        row.material_lots.materials
                          ? ` — ${row.material_lots.materials.code} (${row.material_lots.materials.name})`
                          : ""
                      }`
                    : null;
                const batchRef =
                  row.subject_kind === "production_batch" &&
                  row.production_batches
                    ? `${row.production_batches.batch_number}${
                        row.production_batches.production_orders
                          ? ` — ${row.production_batches.production_orders.code}`
                          : ""
                      }`
                    : null;
                return (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link
                        href={companyModulePath(companyId, "quality", row.id)}
                        className="hover:underline"
                      >
                        {row.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {SUBJECT_LABEL[row.subject_kind]}
                    </td>
                    <td className="px-3 py-2 text-xs">{lotRef ?? batchRef ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatDate(row.signed_at)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_VARIANT[row.status]}>
                        {STATUS_LABEL[row.status]}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Henüz QC kaydı yok"
          description="Bir karantinadaki lot veya tamamlanmış parti üzerinde QC açın. İmzaya kadar serbestçe düzenlenebilir."
        />
      )}
    </div>
  );
}
