import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  PRODUCTION_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";
import type { ProductionOrderStatus } from "@/types/database";

interface PageProps {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ customer?: string }>;
}

type OrderRow = {
  id: string;
  code: string;
  status: ProductionOrderStatus;
  planned_quantity: number;
  planned_uom: string;
  planned_start_at: string | null;
  planned_end_at: string | null;
  updated_at: string;
  materials: { code: string; name: string } | null;
  recipes: { code: string; name: string; version: number } | null;
  customers: { code: string; name: string } | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_LABEL: Record<ProductionOrderStatus, string> = {
  draft: "Taslak",
  planned: "Planlandı",
  in_progress: "Üretimde",
  completed: "Tamamlandı",
  closed: "Kapatıldı",
  cancelled: "İptal",
};

const STATUS_VARIANT: Record<
  ProductionOrderStatus,
  "default" | "secondary" | "outline" | "warning" | "destructive" | "success"
> = {
  draft: "outline",
  planned: "default",
  in_progress: "warning",
  completed: "success",
  closed: "secondary",
  cancelled: "destructive",
};

function formatNumber(n: number): string {
  return Number(n).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("tr-TR", { dateStyle: "short" });
}

export default async function ProductionOrdersListPage({
  params,
  searchParams,
}: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { customer } = await searchParams;
  const { companyId, role } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const customerFilter = customer && UUID_RE.test(customer) ? customer : null;

  let query = supabase
    .from("production_orders")
    .select(
      "id, code, status, planned_quantity, planned_uom, planned_start_at, planned_end_at, updated_at, " +
        "materials:finished_material_id(code, name), " +
        "recipes:recipe_id(code, name, version), " +
        "customers:customer_id(code, name)",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (customerFilter) {
    query = query.eq("customer_id", customerFilter);
  }

  const [{ data: orders }, { data: customerOptions }] = await Promise.all([
    query.returns<OrderRow[]>(),
    supabase
      .from("customers")
      .select("id, code, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name"),
  ]);

  const rows = orders ?? [];
  const newHref = companyModulePath(companyId, "production", "new");

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Üretim Emirleri</h1>
          <p className="text-sm text-muted-foreground">
            Yayında olan bir reçeteden üretim emri açın. Faz 5c — Adım 1
            yalnızca emir tarafını yönetir; gerçek üretim icrası (lot tüketimi
            ve çıkış lotu) Adım 2&apos;de devreye girer.
          </p>
        </div>
        {canWriteCompanyData(role, PRODUCTION_WRITE_ROLES) ? (
          <Link href={newHref}>
            <Button>Yeni Üretim Emri</Button>
          </Link>
        ) : null}
      </header>

      {(customerOptions ?? []).length > 0 ? (
        <form method="get" className="flex items-end gap-2">
          <div className="space-y-1">
            <label
              htmlFor="customer"
              className="text-xs font-medium text-muted-foreground"
            >
              Müşteriye göre filtrele
            </label>
            <select
              id="customer"
              name="customer"
              defaultValue={customerFilter ?? ""}
              className="flex h-9 w-64 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Tümü</option>
              {(customerOptions ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline" size="sm">
            Uygula
          </Button>
        </form>
      ) : null}

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Kod</th>
                <th className="px-3 py-2 text-left font-medium">Bitmiş Ürün</th>
                <th className="px-3 py-2 text-left font-medium">Müşteri</th>
                <th className="px-3 py-2 text-left font-medium">Reçete</th>
                <th className="px-3 py-2 text-right font-medium">Hedef</th>
                <th className="px-3 py-2 text-left font-medium">Başlangıç</th>
                <th className="px-3 py-2 text-left font-medium">Bitiş</th>
                <th className="px-3 py-2 text-left font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <tr key={order.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link
                      href={companyModulePath(companyId, "production", order.id)}
                      className="hover:underline"
                    >
                      {order.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {order.materials ? (
                      <span>
                        <span className="font-mono text-xs">
                          {order.materials.code}
                        </span>
                        <span className="ml-1">— {order.materials.name}</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {order.customers ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Badge variant="outline">Fason</Badge>
                        <span className="text-xs">{order.customers.name}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {order.recipes ? (
                      <span>
                        <span className="font-mono text-xs">
                          {order.recipes.code}
                        </span>
                        <span className="ml-1">
                          v{order.recipes.version}
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {formatNumber(Number(order.planned_quantity))}{" "}
                    <span className="text-muted-foreground">
                      {order.planned_uom}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDate(order.planned_start_at)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDate(order.planned_end_at)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={STATUS_VARIANT[order.status]}>
                      {STATUS_LABEL[order.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Henüz üretim emri yok"
          description="Yeni bir üretim emri açmak için önce en az bir reçeteyi yayına almalısınız."
        />
      )}
    </div>
  );
}
