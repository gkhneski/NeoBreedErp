import { EmptyState } from "@/components/ui/empty-state";
import { requireBuyer } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SalesOrderStatus } from "@/types/database";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

const STATUS: Record<SalesOrderStatus, { label: string; cls: string }> = {
  placed: { label: "Alındı", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  confirmed: { label: "Onaylandı", cls: "bg-violet-500/15 text-violet-700 dark:text-violet-400" },
  preparing: { label: "Hazırlanıyor", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  shipped: { label: "Sevk edildi", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  cancelled: { label: "İptal", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
};

type OrderRow = {
  id: string;
  code: string;
  status: SalesOrderStatus;
  notes: string | null;
  created_at: string;
  sales_order_items: Array<{
    quantity: number;
    materials: { name: string } | null;
  }> | null;
};

export default async function PortalOrdersPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireBuyer(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("sales_orders")
    .select(
      "id, code, status, notes, created_at, " +
        "sales_order_items(quantity, materials:material_id(name))",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .returns<OrderRow[]>();

  const orders = data ?? [];

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Siparişlerim</h1>
        <p className="text-sm text-muted-foreground">
          Geçmiş siparişleriniz ve güncel durumları.
        </p>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          title="Henüz sipariş yok"
          description="Katalogdan ürün seçip ilk siparişinizi oluşturun."
        />
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const s = STATUS[o.status];
            const items = o.sales_order_items ?? [];
            return (
              <div
                key={o.id}
                className="rounded-2xl border border-border bg-card p-3 sm:p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{o.code}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}
                    >
                      {s.label}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString("tr-TR")}
                  </span>
                </div>
                <ul className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                  {items.map((it, i) => (
                    <li key={i}>
                      {it.materials?.name ?? "Ürün"} ×{" "}
                      {Number(it.quantity).toLocaleString("tr-TR")}
                    </li>
                  ))}
                </ul>
                {o.notes ? (
                  <p className="mt-2 text-xs text-muted-foreground">Not: {o.notes}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
