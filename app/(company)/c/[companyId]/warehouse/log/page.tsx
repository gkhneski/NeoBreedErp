import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
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
  before?: LotSnapshot | null;
  after?: LotSnapshot | null;
};

type LotSnapshot = {
  quantity?: number | null;
  lot_number?: string | null;
  expiry_date?: string | null;
};

const ACTION_LABEL: Record<string, string> = {
  depot_receipt_count_correction: "Kabul sayımı",
  depot_lot_correction: "Stok düzeltme",
  depot_lot_void: "Giriş silindi",
};

function headerChanges(d: CorrectionDiff): string[] {
  const out: string[] = [];
  if (d.before && d.after) {
    if (d.before.lot_number !== d.after.lot_number) {
      out.push(`Lot: ${d.before.lot_number ?? "—"} → ${d.after.lot_number ?? "—"}`);
    }
    if ((d.before.expiry_date ?? null) !== (d.after.expiry_date ?? null)) {
      out.push(
        `SKT: ${d.before.expiry_date ? formatDate(d.before.expiry_date) : "—"} → ${
          d.after.expiry_date ? formatDate(d.after.expiry_date) : "—"
        }`,
      );
    }
  }
  return out;
}

type LogRow = {
  id: string;
  action: string;
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
    .select("id, action, actor_id, target_id, target_label, reason, diff, created_at")
    .eq("company_id", companyId)
    .in("action", Object.keys(ACTION_LABEL))
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
          Düzeltme Protokolü
        </h1>
        <p className="text-sm text-muted-foreground">
          Depo kabulde sayım farkları ve depocunun stok düzeltmelerinin
          (adet, lot no, SKT, silinen giriş) değiştirilemez kaydı. Son 200 işlem
          gösterilir.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="Henüz düzeltme yok"
          description="Sayım farkı olan kabuller ve Stok Düzelt ekranından yapılan düzeltmeler; kim, ne zaman, önce/sonra ve neden burada listelenir."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Tarih</th>
                <th className="px-3 py-2 text-left font-medium">İşlem</th>
                <th className="px-3 py-2 text-left font-medium">Lot</th>
                <th className="px-3 py-2 text-left font-medium">Ürün</th>
                <th className="px-3 py-2 text-left font-medium">Depo</th>
                <th className="px-3 py-2 text-right font-medium">Önce</th>
                <th className="px-3 py-2 text-right font-medium">Sonra</th>
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
                const before = d.before ? d.before.quantity : d.expected;
                const after =
                  row.action === "depot_lot_void"
                    ? 0
                    : d.after
                      ? d.after.quantity
                      : d.counted;
                const changes = headerChanges(d);
                return (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      {ACTION_LABEL[row.action] ?? row.action}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.target_id && row.action !== "depot_lot_void" ? (
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
                      {formatQty(before)} {unit}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs">
                      {formatQty(after)} {unit}
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
                      {changes.length > 0 ? (
                        <span className="block text-muted-foreground">
                          {changes.join(" · ")}
                        </span>
                      ) : null}
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
