import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requireModuleAccess } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PurchaseOrderStatus } from "@/types/database";
import { companyModulePath } from "@/types/roles";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

const STATUS: Record<PurchaseOrderStatus, { label: string; variant: "secondary" | "warning" | "success" | "destructive" }> = {
  draft: { label: "Taslak", variant: "secondary" },
  sent: { label: "Gönderildi", variant: "warning" },
  received: { label: "Mal Kabul", variant: "success" },
  cancelled: { label: "İptal", variant: "destructive" },
};

type Row = {
  id: string;
  code: string;
  status: PurchaseOrderStatus;
  created_at: string;
  suppliers: { name: string } | null;
  purchase_order_lines: Array<{ id: string }> | null;
};

export default async function PurchaseOrdersPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireModuleAccess(routeCompanyId, "purchase-orders");
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("purchase_orders")
    .select(
      "id, code, status, created_at, suppliers:supplier_id(name), purchase_order_lines(id)",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .returns<Row[]>();

  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Satınalma Siparişleri</h1>
        <p className="text-sm text-muted-foreground">
          MRP&apos;den üretilen, tedarikçiye gönderilen ve mal kabulü yapılan siparişler.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="Henüz satınalma siparişi yok"
          description="MRP ekranından 'Satınalma Siparişine Dönüştür' ile oluşturabilirsiniz."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Kod</th>
                <th className="px-3 py-2 text-left">Tedarikçi</th>
                <th className="px-3 py-2 text-right">Satır</th>
                <th className="px-3 py-2 text-left">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((po) => (
                <tr key={po.id} className="hover:bg-secondary/30">
                  <td className="px-3 py-2 font-mono">
                    <Link
                      href={companyModulePath(companyId, "purchase-orders", po.id)}
                      className="hover:underline"
                    >
                      {po.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{po.suppliers?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {po.purchase_order_lines?.length ?? 0}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={STATUS[po.status].variant}>
                      {STATUS[po.status].label}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
