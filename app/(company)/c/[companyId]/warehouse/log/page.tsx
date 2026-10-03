import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { unitLabelForDisplay } from "@/lib/production/pack";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type CorrectionDiff = {
  material_code?: string | null;
  material_name?: string | null;
  uom?: string | null;
  expected?: number | null;
  counted?: number | null;
  delta?: number | null;
  to_location_code?: string | null;
  to_location_name?: string | null;
};

type LogRow = {
  id: string;
  actor_id: string | null;
  target_id: string | null;
  target_label: string | null;
  reason: string | null;
  diff: CorrectionDiff | null;
  created_at: string;
};

function formatQty(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 6 });
}

export default async function DepotCountCorrectionLogPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const { data: entries } = await supabase
    .from("audit_log")
    .select("id, actor_id, target_id, target_label, reason, diff, created_at")
    .eq("company_id", companyId)
    .eq("action", "depot_receipt_count_correction")
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
            href={companyModulePath(companyId, "warehouse")}
            className="hover:underline"
          >
            ← Depo Hareketleri
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Sayım Düzeltme Protokolü
        </h1>
        <p className="text-sm text-muted-foreground">
          Depo kabulde sayımı sistemdeki miktardan farklı girilen lotların
          değiştirilemez kaydı. Son 200 işlem gösterilir.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="Henüz sayım düzeltmesi yok"
          description="Depocu bir lotu sayarak alırken sistemdeki miktardan farklı bir sayı girip onaylarsa; kim, ne zaman, beklenen/sayılan ve neden burada listelenir."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Tarih</th>
                <th className="px-3 py-2 text-left font-medium">Lot</th>
                <th className="px-3 py-2 text-left font-medium">Ürün</th>
                <th className="px-3 py-2 text-left font-medium">Depo</th>
                <th className="px-3 py-2 text-right font-medium">Beklenen</th>
                <th className="px-3 py-2 text-right font-medium">Sayılan</th>
                <th className="px-3 py-2 text-right font-medium">Fark</th>
                <th className="px-3 py-2 text-left font-medium">Sayan</th>
                <th className="px-3 py-2 text-left font-medium">Neden</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const d = row.diff ?? {};
                const unit = unitLabelForDisplay(d.uom ?? "");
                const delta = d.delta ?? null;
                return (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.target_id ? (
                        <Link
                          href={companyModulePath(companyId, "lots", row.target_id)}
                          className="hover:underline"
                        >
                          {row.target_label ?? row.target_id.slice(0, 8)}
                        </Link>
                      ) : (
                        (row.target_label ?? "—")
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {d.material_code ? (
                        <span>
                          <span className="font-mono text-xs">{d.material_code}</span>
                          <span className="ml-1">— {d.material_name}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {d.to_location_name ?? d.to_location_code ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs">
                      {formatQty(d.expected)} {unit}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs">
                      {formatQty(d.counted)} {unit}
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-2 text-right font-mono text-xs ${
                        delta != null && delta < 0
                          ? "text-destructive"
                          : "text-emerald-700"
                      }`}
                    >
                      {delta != null
                        ? `${delta > 0 ? "+" : ""}${formatQty(delta)} ${unit}`
                        : "—"}
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
