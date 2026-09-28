import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { requireModuleAccess } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { unitLabelForDisplay } from "@/lib/production/pack";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type DeletedOrderSnapshot = {
  status?: string | null;
  material_code?: string | null;
  material_name?: string | null;
  recipe_code?: string | null;
  recipe_version?: number | null;
  customer_name?: string | null;
  planned_quantity?: number | null;
  planned_uom?: string | null;
  batch_numbers?: string[] | null;
};

type LogRow = {
  id: string;
  actor_id: string | null;
  target_label: string | null;
  reason: string | null;
  diff: DeletedOrderSnapshot | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Taslak",
  planned: "Planlandı",
  in_progress: "Üretimde",
  cancelled: "İptal",
};

export default async function ProductionDeletionLogPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireModuleAccess(routeCompanyId, "production");
  const supabase = await createServerSupabaseClient();

  const { data: entries } = await supabase
    .from("audit_log")
    .select("id, actor_id, target_label, reason, diff, created_at")
    .eq("company_id", companyId)
    .eq("action", "delete_production_order")
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<LogRow[]>();

  const rows = entries ?? [];

  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor_id).filter((id): id is string => !!id)),
  );
  const { data: profiles } =
    actorIds.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
      : { data: [] as { id: string; full_name: string | null }[] };
  const actorName = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name ?? null]),
  );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          <Link
            href={companyModulePath(companyId, "production")}
            className="hover:underline"
          >
            ← Üretim Emirleri
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Silme Protokolü</h1>
        <p className="text-sm text-muted-foreground">
          Silinen üretim emirlerinin değiştirilemez kaydı. Son 200 işlem
          gösterilir.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="Henüz silinen üretim emri yok"
          description="Bir üretim emri silindiğinde; kim, ne zaman ve neden sildiği burada listelenir."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Tarih</th>
                <th className="px-3 py-2 text-left font-medium">Kod</th>
                <th className="px-3 py-2 text-left font-medium">Ürün</th>
                <th className="px-3 py-2 text-left font-medium">Müşteri</th>
                <th className="px-3 py-2 text-right font-medium">Hedef</th>
                <th className="px-3 py-2 text-left font-medium">Durum</th>
                <th className="px-3 py-2 text-left font-medium">Parti</th>
                <th className="px-3 py-2 text-left font-medium">Silen</th>
                <th className="px-3 py-2 text-left font-medium">Neden</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const d = row.diff ?? {};
                const batches = d.batch_numbers ?? [];
                return (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.target_label ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {d.material_code ? (
                        <span>
                          <span className="font-mono text-xs">
                            {d.material_code}
                          </span>
                          <span className="ml-1">— {d.material_name}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                      {d.recipe_code ? (
                        <div className="text-xs text-muted-foreground">
                          <span className="font-mono">{d.recipe_code}</span> v
                          {d.recipe_version}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {d.customer_name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs">
                      {d.planned_quantity != null
                        ? `${Number(d.planned_quantity).toLocaleString("tr-TR", {
                            maximumFractionDigits: 6,
                          })} ${unitLabelForDisplay(d.planned_uom ?? "")}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {d.status ? (STATUS_LABEL[d.status] ?? d.status) : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {batches.length > 0 ? batches.join(", ") : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.actor_id
                        ? (actorName.get(row.actor_id) ?? (
                            <span className="font-mono" title={row.actor_id}>
                              {row.actor_id.slice(0, 8)}…
                            </span>
                          ))
                        : "—"}
                    </td>
                    <td className="max-w-xs whitespace-pre-wrap px-3 py-2 text-xs">
                      {row.reason ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
