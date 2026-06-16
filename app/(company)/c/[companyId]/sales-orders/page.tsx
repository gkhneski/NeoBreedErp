import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requireModuleAccess } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ORDER_WRITE_ROLES,
  canWriteCompanyData,
} from "@/types/roles";
import type { SalesOrderSource, SalesOrderStatus } from "@/types/database";

import { SalesOrdersList, type SalesOrderRow } from "./sales-orders-list";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type Row = {
  id: string;
  code: string;
  status: SalesOrderStatus;
  source: SalesOrderSource;
  notes: string | null;
  seen_at: string | null;
  created_at: string;
  customers: { name: string } | null;
  sales_order_items: Array<{
    quantity: number;
    unit_price: number | null;
    materials: { name: string } | null;
  }> | null;
};

export default async function SalesOrdersPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireModuleAccess(
    routeCompanyId,
    "sales-orders",
  );
  const canWrite = canWriteCompanyData(role, ORDER_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("sales_orders")
    .select(
      "id, code, status, source, notes, seen_at, created_at, " +
        "customers:customer_id(name), " +
        "sales_order_items(quantity, unit_price, materials:material_id(name))",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .returns<Row[]>();

  const rows: SalesOrderRow[] = (data ?? []).map((o) => ({
    id: o.id,
    code: o.code,
    status: o.status,
    source: o.source,
    notes: o.notes,
    isNew: o.seen_at === null,
    createdAt: o.created_at,
    customerName: o.customers?.name ?? "—",
    items: (o.sales_order_items ?? []).map((it) => ({
      name: it.materials?.name ?? "Ürün",
      quantity: Number(it.quantity),
      unitPrice: it.unit_price === null ? null : Number(it.unit_price),
    })),
  }));

  const newCount = rows.filter((r) => r.isNew).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Eczane Siparişleri</h1>
          <p className="text-sm text-muted-foreground">
            Portaldan ve bölge müdürlerinden gelen B2B siparişleri.
          </p>
        </div>
        {newCount > 0 ? <Badge variant="warning">{newCount} yeni</Badge> : null}
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="Henüz sipariş yok"
          description="Eczaneler portaldan sipariş verdikçe burada görünür."
        />
      ) : (
        <SalesOrdersList companyId={companyId} rows={rows} canWrite={canWrite} />
      )}
    </div>
  );
}
