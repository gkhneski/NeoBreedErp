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
  const { companyId, role } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const { data: receipts } = await supabase
    .from("stock_movements")
    .select(
      "id, quantity, unit_cost, occurred_at, notes, " +
        "materials:material_id(code, name, base_uom), " +
        "material_lots:lot_id(lot_number)",
    )
    .eq("company_id", companyId)
    .eq("kind", "receipt")
    .order("occurred_at", { ascending: false })
    .limit(200)
    .returns<ReceiptRow[]>();

  const rows = receipts ?? [];

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
        {canWriteCompanyData(role, STOCK_WRITE_ROLES) ? (
          <Link href={companyModulePath(companyId, "purchases", "new")}>
            <Button>Yeni Belge</Button>
          </Link>
        ) : null}
      </header>

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Tarih</th>
                <th className="px-3 py-2 text-left font-medium">Tür</th>
                <th className="px-3 py-2 text-left font-medium">Malzeme</th>
                <th className="px-3 py-2 text-left font-medium">Lot</th>
                <th className="px-3 py-2 text-right font-medium">Miktar</th>
                <th className="px-3 py-2 text-left font-medium">Belge / Not</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDate(r.occurred_at)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge>Mal Kabul</Badge>
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
                </tr>
              ))}
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
