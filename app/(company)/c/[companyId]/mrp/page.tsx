import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireModuleAccess } from "@/lib/auth";
import { gatherMrpPlan } from "@/lib/mrp/explode";
import { canWriteCompanyData, PRODUCTION_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { MrpActions } from "./mrp-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

const num = (n: number) =>
  Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 3 });

export default async function MrpPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireModuleAccess(routeCompanyId, "mrp");
  const canWrite = canWriteCompanyData(role, PRODUCTION_WRITE_ROLES);
  const plan = await gatherMrpPlan(companyId);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">MRP — Malzeme İhtiyaç Planlama</h1>
          <p className="text-sm text-muted-foreground">
            Açık müşteri siparişlerini reçeteye göre patlatır, stoğu netler;
            üretim ve satınalma ihtiyacını çıkarır.
          </p>
        </div>
        <Link href={companyModulePath(companyId, "sales-orders", "manual")}>
          <Button variant="outline">Yeni Müşteri Siparişi</Button>
        </Link>
      </header>

      {!plan.hasDemand ? (
        <EmptyState
          title="Açık talep yok"
          description="MRP çalıştırmak için açık (sevk edilmemiş) bir müşteri siparişi gerekir. Önce manuel sipariş girin."
        />
      ) : (
        <>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-sm font-semibold">Talep</h2>
              <Badge variant="secondary">{plan.openOrders} açık sipariş</Badge>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              {plan.demand.map((d) => (
                <span
                  key={d.materialId}
                  className="rounded-full bg-secondary px-3 py-1 text-muted-foreground"
                >
                  {d.name} ×{num(d.quantity)}
                </span>
              ))}
            </div>
          </div>

          {canWrite ? (
            <MrpActions
              companyId={companyId}
              hasProduction={plan.production.length > 0}
              hasPurchases={plan.purchases.length > 0}
            />
          ) : null}

          {/* Production needs */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Üretim İhtiyacı</h2>
            {plan.production.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Stok yeterli — üretim gerekmiyor.
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Tip</th>
                      <th className="px-3 py-2 text-left">Ürün</th>
                      <th className="px-3 py-2 text-right">İhtiyaç</th>
                      <th className="px-3 py-2 text-right">Stok</th>
                      <th className="px-3 py-2 text-right">Üretilecek</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {plan.production.map((p) => (
                      <tr key={p.materialId}>
                        <td className="px-3 py-2">
                          <Badge variant={p.level === "semi" ? "warning" : "secondary"}>
                            {p.level === "semi" ? "YM" : "Mamül"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          {p.code} · {p.name}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {num(p.grossQuantity)} {p.uom}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {num(p.stockQuantity)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                          {num(p.produceQuantity)} {p.uom}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Purchase needs */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Satınalma İhtiyacı</h2>
            {plan.purchases.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Stok yeterli — satınalma gerekmiyor.
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Malzeme</th>
                      <th className="px-3 py-2 text-left">Tedarikçi</th>
                      <th className="px-3 py-2 text-right">İhtiyaç</th>
                      <th className="px-3 py-2 text-right">Stok</th>
                      <th className="px-3 py-2 text-right">Alınacak</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {plan.purchases.map((p) => (
                      <tr key={p.materialId}>
                        <td className="px-3 py-2">
                          {p.code} · {p.name}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {p.supplierName ?? "— (tedarikçi atanmamış)"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {num(p.grossQuantity)} {p.uom}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {num(p.stockQuantity)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                          {num(p.buyQuantity)} {p.uom}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
