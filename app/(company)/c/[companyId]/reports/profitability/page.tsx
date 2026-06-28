import Link from "next/link";

import { requireModuleAccess } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ month?: string }>;
}

const tl = (n: number | null) =>
  n === null
    ? "—"
    : `${Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
const num = (n: number) => Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 });

export default async function ProfitabilityReportPage({ params, searchParams }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { month } = await searchParams;
  const { companyId } = await requireModuleAccess(routeCompanyId, "reports");
  const supabase = await createServerSupabaseClient();

  const monthStr = month && /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  const [y, m] = monthStr.split("-").map(Number);
  const startIso = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const endIso = new Date(Date.UTC(y, m, 1)).toISOString();

  // Finished materials.
  const { data: finished } = await supabase
    .from("materials")
    .select("id, code, name")
    .eq("company_id", companyId)
    .eq("type", "finished")
    .is("deleted_at", null)
    .returns<Array<{ id: string; code: string; name: string }>>();
  const finishedIds = new Set((finished ?? []).map((f) => f.id));
  const metaById = new Map((finished ?? []).map((f) => [f.id, f]));

  // Completed batches in month + their order's finished material.
  const { data: batches } = await supabase
    .from("production_batches")
    .select("production_order_id, actual_quantity, cost_total, completed_at")
    .eq("company_id", companyId)
    .in("status", ["completed", "closed"])
    .gte("completed_at", startIso)
    .lt("completed_at", endIso)
    .returns<
      Array<{
        production_order_id: string;
        actual_quantity: number | null;
        cost_total: number | null;
        completed_at: string | null;
      }>
    >();

  const orderIds = [...new Set((batches ?? []).map((b) => b.production_order_id))];
  const orderMat = new Map<string, string>();
  if (orderIds.length > 0) {
    const { data: orders } = await supabase
      .from("production_orders")
      .select("id, finished_material_id")
      .eq("company_id", companyId)
      .in("id", orderIds);
    for (const o of orders ?? []) orderMat.set(o.id, o.finished_material_id);
  }

  type Agg = { producedBoxes: number; cogsTotal: number; revenue: number; soldQty: number };
  const agg = new Map<string, Agg>();
  const get = (id: string) =>
    agg.get(id) ?? { producedBoxes: 0, cogsTotal: 0, revenue: 0, soldQty: 0 };

  let totalProducedBoxes = 0;
  for (const b of batches ?? []) {
    const matId = orderMat.get(b.production_order_id);
    if (!matId || !finishedIds.has(matId)) continue;
    const boxes = Number(b.actual_quantity ?? 0);
    const a = get(matId);
    a.producedBoxes += boxes;
    a.cogsTotal += Number(b.cost_total ?? 0);
    agg.set(matId, a);
    totalProducedBoxes += boxes;
  }

  // Month expenses (overhead pool).
  const { data: expenses } = await supabase
    .from("company_expenses")
    .select("amount")
    .eq("company_id", companyId)
    .eq("period_month", `${monthStr}-01`)
    .is("deleted_at", null);
  const overheadPool = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const overheadRate = totalProducedBoxes > 0 ? overheadPool / totalProducedBoxes : 0;

  // Revenue in month from sales orders.
  const { data: orders2 } = await supabase
    .from("sales_orders")
    .select("created_at, sales_order_items(material_id, quantity, unit_price)")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .returns<
      Array<{
        created_at: string;
        sales_order_items: Array<{
          material_id: string;
          quantity: number;
          unit_price: number | null;
        }> | null;
      }>
    >();
  for (const o of orders2 ?? []) {
    for (const it of o.sales_order_items ?? []) {
      if (!finishedIds.has(it.material_id)) continue;
      const a = get(it.material_id);
      a.revenue += Number(it.quantity) * Number(it.unit_price ?? 0);
      a.soldQty += Number(it.quantity);
      agg.set(it.material_id, a);
    }
  }

  const rows = [...agg.entries()]
    .map(([id, a]) => {
      const cogsUnit = a.producedBoxes > 0 ? a.cogsTotal / a.producedBoxes : 0;
      const totalUnit = cogsUnit + overheadRate;
      const salePrice = a.soldQty > 0 ? a.revenue / a.soldQty : null;
      const marginUnit = salePrice === null ? null : salePrice - totalUnit;
      const marginPct = salePrice && salePrice > 0 && marginUnit !== null ? (marginUnit / salePrice) * 100 : null;
      return {
        id,
        meta: metaById.get(id),
        ...a,
        cogsUnit,
        overheadUnit: overheadRate,
        totalUnit,
        salePrice,
        marginUnit,
        marginPct,
      };
    })
    .sort((a, b) => (b.marginUnit ?? -Infinity) - (a.marginUnit ?? -Infinity));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Karlılık Raporu</h1>
          <p className="text-sm text-muted-foreground">
            Üretim maliyeti + genel gider (üretilen kutuya dağıtılmış) vs satış fiyatı.
          </p>
        </div>
        <form className="flex items-end gap-2">
          <label className="text-sm">
            Ay{" "}
            <input
              type="month"
              name="month"
              defaultValue={monthStr}
              className="ml-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <button className="h-9 rounded-md border border-input px-3 text-sm" type="submit">
            Göster
          </button>
        </form>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card label="Üretilen Kutu (ay)" value={num(totalProducedBoxes)} />
        <Card label="Genel Gider (ay)" value={tl(overheadPool)} />
        <Card label="Kutu Başına Genel Gider" value={tl(overheadRate)} />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Bu ay maliyetli üretim kaydı yok. Üretim tamamlayın veya başka ay seçin.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Ürün</th>
                <th className="px-3 py-2 text-right">Üretilen</th>
                <th className="px-3 py-2 text-right">Birim Üretim</th>
                <th className="px-3 py-2 text-right">+Genel Gider</th>
                <th className="px-3 py-2 text-right">Birim Maliyet</th>
                <th className="px-3 py-2 text-right">Satış Fiyatı</th>
                <th className="px-3 py-2 text-right">Birim Kâr</th>
                <th className="px-3 py-2 text-right">Marj %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    {r.meta ? `${r.meta.code} · ${r.meta.name}` : r.id}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(r.producedBoxes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{tl(r.cogsUnit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {tl(r.overheadUnit)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{tl(r.totalUnit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{tl(r.salePrice)}</td>
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${
                      r.marginUnit === null
                        ? "text-muted-foreground"
                        : r.marginUnit >= 0
                          ? "text-emerald-600"
                          : "text-rose-600"
                    }`}
                  >
                    {tl(r.marginUnit)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.marginPct === null ? "—" : `%${num(r.marginPct)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Not: Birim maliyet = tüketilen malzeme (iş emri) maliyeti ÷ üretilen kutu +
        kutu başına genel gider. Satış fiyatı, aydaki müşteri siparişi kalem
        fiyatlarının ortalamasıdır.{" "}
        <Link href={companyModulePath(companyId, "expenses")} className="underline">
          Giderler
        </Link>
      </p>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </article>
  );
}
