import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ProductionOrderStatus } from "@/types/database";
import { companyModulePath } from "@/types/roles";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type OrderRow = {
  id: string;
  code: string;
  status: ProductionOrderStatus;
  planned_quantity: number;
  planned_uom: string;
  planned_start_at: string | null;
  materials: { code: string; name: string } | null;
};

const STATUS_LABEL: Record<ProductionOrderStatus, string> = {
  draft: "Taslak",
  planned: "Planlandı",
  in_progress: "Üretimde",
  completed: "Tamamlandı",
  closed: "Kapandı",
  cancelled: "İptal",
};

export default async function OrdersPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const { data: orders } = await supabase
    .from("production_orders")
    .select(
      "id, code, status, planned_quantity, planned_uom, planned_start_at, materials:finished_material_id(code, name)",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("planned_start_at", { ascending: true, nullsFirst: false })
    .limit(100)
    .returns<OrderRow[]>();

  const rows = orders ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Siparişler</h1>
          <p className="text-sm text-muted-foreground">
            MVP sunumunda sipariş görünümü, üretim emirlerinden beslenen iş
            karşılama listesidir.
          </p>
        </div>
        <Link href={companyModulePath(companyId, "production", "new")}>
          <Button>Üretim Emri Aç</Button>
        </Link>
      </header>

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Referans</th>
                <th className="px-3 py-2 text-left font-medium">Ürün</th>
                <th className="px-3 py-2 text-right font-medium">Miktar</th>
                <th className="px-3 py-2 text-left font-medium">Plan</th>
                <th className="px-3 py-2 text-left font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link
                      href={companyModulePath(companyId, "production", row.id)}
                      className="hover:underline"
                    >
                      {row.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {row.materials ? (
                      <>
                        <span className="font-mono text-xs">
                          {row.materials.code}
                        </span>
                        <span className="ml-1">— {row.materials.name}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {Number(row.planned_quantity).toLocaleString("tr-TR", {
                      maximumFractionDigits: 6,
                    })}{" "}
                    {row.planned_uom}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {row.planned_start_at
                      ? new Date(row.planned_start_at).toLocaleDateString("tr-TR")
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={
                        row.status === "cancelled"
                          ? "destructive"
                          : row.status === "closed"
                            ? "secondary"
                            : row.status === "completed"
                              ? "success"
                              : "default"
                      }
                    >
                      {STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Karşılanacak iş yok"
          description="Üretim emri açıldığında sipariş görünümünde takip edebilirsiniz."
        />
      )}
    </div>
  );
}
