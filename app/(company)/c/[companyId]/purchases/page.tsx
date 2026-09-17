import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireModuleAccess } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  STOCK_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

import { MovementCancelButton } from "../stock/movement-cancel-button";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type ReceiptRow = {
  id: string;
  quantity: number;
  unit_cost: number | null;
  occurred_at: string;
  notes: string | null;
  materials: { code: string; name: string; base_uom: string } | null;
  material_lots: { lot_number: string } | null;
};

function formatNumber(n: number): string {
  return Number(n).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", { dateStyle: "short" });
}

export default async function PurchaseReceiptsPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireModuleAccess(routeCompanyId, "purchases");
  const supabase = await createServerSupabaseClient();

  const { data: receipts } = await supabase
    .from("stock_movements")
    .select(
      "id, quantity, unit_cost, occurred_at, notes, " +
        "materials:material_id(code, name, base_uom), " +
        "material_lots:lot_id!inner(lot_number, deleted_at)",
    )
    .eq("company_id", companyId)
    .eq("kind", "receipt")
    .is("material_lots.deleted_at", null)
    .order("occurred_at", { ascending: false })
    .limit(200)
    .returns<ReceiptRow[]>();

  const rows = receipts ?? [];
  const canWrite = canWriteCompanyData(role, STOCK_WRITE_ROLES);

  const { data: reversals } =
    rows.length > 0
      ? await supabase
          .from("stock_movements")
          .select("reverses_movement_id")
          .eq("company_id", companyId)
          .in(
            "reverses_movement_id",
            rows.map((r) => r.id),
          )
      : { data: [] };
  const reversedIds = new Set(
    (reversals ?? []).map((r) => r.reverses_movement_id),
  );

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Fatura / İrsaliye
          </h1>
          <p className="text-sm text-muted-foreground">
            Sirket ici manuel alım belgeleri. Bu ekrandan kaydedilen satirlar
            stok defterine mal kabul olarak islenir.
          </p>
        </div>
        {canWrite ? (
          <Link href={companyModulePath(companyId, "purchases", "new")}>
            <Button>Yeni Belge</Button>
          </Link>
        ) : null}
      </header>

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Tarih</th>
                <th className="px-3 py-2 text-left font-medium">Tür</th>
                <th className="px-3 py-2 text-left font-medium">Malzeme</th>
                <th className="px-3 py-2 text-left font-medium">Lot</th>
                <th className="px-3 py-2 text-right font-medium">Miktar</th>
                <th className="px-3 py-2 text-left font-medium">Belge / Not</th>
                {canWrite ? <th className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const reversed = reversedIds.has(r.id);
                return (
                <tr
                  key={r.id}
                  className={cn(
                    "border-t border-border align-top",
                    reversed && "line-through opacity-50",
                  )}
                >
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDate(r.occurred_at)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge>Mal Kabul</Badge>
                      {reversed ? (
                        <Badge variant="destructive">İptal edildi</Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {r.materials ? (
                      <span>
                        <span className="font-mono text-xs">
                          {r.materials.code}
                        </span>
                        <span className="ml-1">- {r.materials.name}</span>
                      </span>
                    ) : (
                      "--"
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.material_lots?.lot_number ?? "--"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    +{formatNumber(Number(r.quantity))}{" "}
                    <span className="text-muted-foreground">
                      {r.materials?.base_uom ?? ""}
                    </span>
                  </td>
                  <td className="whitespace-pre-line px-3 py-2 text-xs text-muted-foreground">
                    {r.notes ?? "--"}
                  </td>
                  {canWrite ? (
                    <td className="px-3 py-2 text-right">
                      {!reversed ? (
                        <MovementCancelButton
                          companyId={companyId}
                          movementId={r.id}
                          summary={`${r.materials?.code ?? ""} ${r.materials?.name ?? ""} · Lot ${r.material_lots?.lot_number ?? "—"} · +${formatNumber(Number(r.quantity))} ${r.materials?.base_uom ?? ""}`}
                        />
                      ) : null}
                    </td>
                  ) : null}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Henüz alım belgesi yok"
          description="Yeni belge kaydederek stoga mal kabul isleyebilirsiniz."
        />
      )}
    </div>
  );
}
