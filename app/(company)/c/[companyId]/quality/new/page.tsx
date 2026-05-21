import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { QUALITY_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { QualityCheckForm, type SubjectOption } from "./quality-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type LotRow = {
  id: string;
  lot_number: string;
  expiry_date: string | null;
  materials: { code: string; name: string } | null;
};

type BatchRow = {
  id: string;
  batch_number: string;
  output_lot_id: string | null;
  production_orders: { code: string } | null;
  material_lots:
    | {
        status: "quarantine" | "released" | "blocked";
        materials: { code: string; name: string } | null;
      }
    | null;
};

export default async function NewQualityCheckPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    QUALITY_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const [{ data: lots }, { data: batches }, { data: latest }] =
    await Promise.all([
      supabase
        .from("material_lots")
        .select(
          "id, lot_number, expiry_date, materials:material_id(code, name)",
        )
        .eq("company_id", companyId)
        .eq("status", "quarantine")
        .is("deleted_at", null)
        .order("received_at", { ascending: false })
        .returns<LotRow[]>(),
      supabase
        .from("production_batches")
        .select(
          "id, batch_number, output_lot_id, " +
            "production_orders:production_order_id(code), " +
            "material_lots:output_lot_id(status, materials:material_id(code, name))",
        )
        .eq("company_id", companyId)
        .eq("status", "completed")
        .is("deleted_at", null)
        .order("completed_at", { ascending: false })
        .returns<BatchRow[]>(),
      supabase
        .from("quality_checks")
        .select("code")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("code", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const lotOptions: SubjectOption[] = (lots ?? []).map((l) => ({
    id: l.id,
    label: `${l.lot_number}${
      l.materials ? ` — ${l.materials.code} (${l.materials.name})` : ""
    }${l.expiry_date ? ` · SKT ${l.expiry_date}` : ""}`,
  }));

  const batchOptions: SubjectOption[] = (batches ?? [])
    .filter((b) => b.output_lot_id && b.material_lots?.status === "quarantine")
    .map((b) => ({
      id: b.id,
      label: `${b.batch_number}${
        b.production_orders ? ` — ${b.production_orders.code}` : ""
      }${
        b.material_lots?.materials
          ? ` · ${b.material_lots.materials.code}`
          : ""
      }`,
    }));

  const nextCode = nextQualityCode(latest?.code ?? null);
  const cancelHref = companyModulePath(companyId, "quality");

  const hasSubjects = lotOptions.length + batchOptions.length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Yeni QC Kaydı</h1>
        <p className="text-sm text-muted-foreground">
          Karantinadaki bir hammadde lotu veya tamamlanmış bir üretim partisi
          (çıkış lotu karantinada) için kalite kontrol başlatın. Başlangıç
          kontrol listesini buradan girin; ölçüm değerlerini bir sonraki ekranda
          gireceksiniz.
        </p>
      </header>

      {hasSubjects ? (
        <QualityCheckForm
          companyId={companyId}
          defaultCode={nextCode}
          lots={lotOptions}
          batches={batchOptions}
        />
      ) : (
        <EmptyState
          title="QC için uygun konu yok"
          description="Karantinadaki bir lot veya tamamlanmış bir üretim partisi olmadan QC açılamaz."
          action={
            <Link
              href={cancelHref}
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              Listeye dön
            </Link>
          }
        />
      )}
    </div>
  );
}

function nextQualityCode(latest: string | null): string {
  if (!latest) return "QC-000001";
  const match = latest.match(/^QC-(\d{1,9})$/);
  if (!match) return "QC-000001";
  const next = (parseInt(match[1], 10) + 1).toString().padStart(6, "0");
  return `QC-${next}`;
}
