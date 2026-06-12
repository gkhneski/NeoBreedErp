import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  STOCK_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type LotRow = {
  id: string;
  lot_number: string;
  quantity_on_hand: number;
  status: "quarantine" | "released" | "blocked";
  expiry_date: string | null;
  materials: { code: string; name: string; base_uom: string } | null;
};

type MovementRow = {
  id: string;
  kind: "receipt" | "issue" | "adjustment" | "transfer";
  quantity: number;
  occurred_at: string;
  materials: { code: string; name: string; base_uom: string } | null;
  material_lots: { lot_number: string } | null;
  from_location: { name: string } | null;
  to_location: { name: string } | null;
};

const KIND_LABEL: Record<MovementRow["kind"], string> = {
  receipt: "Mal Kabul",
  issue: "Çıkış",
  adjustment: "Düzeltme",
  transfer: "Transfer",
};

const LOT_STATUS_LABEL: Record<LotRow["status"], string> = {
  quarantine: "Karantina",
  released: "Serbest",
  blocked: "Bloklu",
};

function formatNumber(n: number): string {
  return Number(n).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

export default async function WarehousePage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  // operator = depo: hammadde lot/hareketleri fabrika konusu, yalnizca bitmis urun gorur.
  const isOperator = role === "operator";

  let lotsQuery = supabase
    .from("material_lots")
    .select(
      `id, lot_number, quantity_on_hand, status, expiry_date, materials:material_id${isOperator ? "!inner" : ""}(code, name, base_uom, type)`,
    )
    .eq("company_id", companyId)
    .is("deleted_at", null);
  if (isOperator) lotsQuery = lotsQuery.eq("materials.type", "finished");

  let movementsQuery = supabase
    .from("stock_movements")
    .select(
      `id, kind, quantity, occurred_at, materials:material_id${isOperator ? "!inner" : ""}(code, name, base_uom, type), material_lots:lot_id(lot_number), ` +
        "from_location:from_location_id(name), to_location:to_location_id(name)",
    )
    .eq("company_id", companyId);
  if (isOperator) movementsQuery = movementsQuery.eq("materials.type", "finished");

  const [{ data: lots }, { data: movements }] = await Promise.all([
    lotsQuery
      .order("updated_at", { ascending: false })
      .limit(12)
      .returns<LotRow[]>(),
    movementsQuery
      .order("occurred_at", { ascending: false })
      .limit(8)
      .returns<MovementRow[]>(),
  ]);

  const lotRows = lots ?? [];
  const movementRows = movements ?? [];
  const released = lotRows.filter((lot) => lot.status === "released").length;
  const quarantine = lotRows.filter((lot) => lot.status === "quarantine").length;
  const blocked = lotRows.filter((lot) => lot.status === "blocked").length;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Depo Hareketleri
          </h1>
          <p className="text-sm text-muted-foreground">
            Lot durumu ve son stok hareketleri için depo çalışma ekranı.
          </p>
        </div>
        {canWriteCompanyData(role, STOCK_WRITE_ROLES) ? (
          <div className="flex flex-wrap gap-2">
            <Link href={companyModulePath(companyId, "warehouse", "scan")}>
              <Button>Barkod Tara</Button>
            </Link>
            {!isOperator ? (
              <Link href={companyModulePath(companyId, "lots", "new")}>
                <Button variant="outline">Mal Kabul</Button>
              </Link>
            ) : null}
            <Link href={companyModulePath(companyId, "stock", "new")}>
              <Button variant="outline">Stok Hareketi</Button>
            </Link>
          </div>
        ) : null}
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-md border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Serbest Lot</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{released}</p>
        </article>
        <article className="rounded-md border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Karantina</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{quarantine}</p>
        </article>
        <article className="rounded-md border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Bloklu</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{blocked}</p>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Güncel Lotlar</h2>
          {lotRows.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-sm">
                <tbody>
                  {lotRows.map((lot) => (
                    <tr key={lot.id} className="border-t border-border first:border-t-0">
                      <td className="px-3 py-2 font-mono text-xs">
                        <Link
                          href={companyModulePath(companyId, "lots", lot.id)}
                          className="hover:underline"
                        >
                          {lot.lot_number}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        {lot.materials?.code ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {formatNumber(Number(lot.quantity_on_hand))}{" "}
                        {lot.materials?.base_uom ?? ""}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Badge
                          variant={
                            lot.status === "released"
                              ? "default"
                              : lot.status === "blocked"
                                ? "destructive"
                                : "warning"
                          }
                        >
                          {LOT_STATUS_LABEL[lot.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Depoda lot yok"
              description="Mal kabul yaptığınızda lotlar burada görünür."
            />
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Son Hareketler</h2>
          {movementRows.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-sm">
                <tbody>
                  {movementRows.map((movement) => (
                    <tr key={movement.id} className="border-t border-border first:border-t-0">
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {new Date(movement.occurred_at).toLocaleString("tr-TR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-3 py-2">
                        {KIND_LABEL[movement.kind]}
                        {movement.kind === "transfer" &&
                        movement.from_location &&
                        movement.to_location ? (
                          <span className="block text-xs text-muted-foreground">
                            {movement.from_location.name} →{" "}
                            {movement.to_location.name}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {movement.material_lots?.lot_number ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {formatNumber(Number(movement.quantity))}{" "}
                        {movement.materials?.base_uom ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Hareket yok"
              description="Stok defterine yazılan son hareketler burada listelenir."
            />
          )}
        </div>
      </section>
    </div>
  );
}
