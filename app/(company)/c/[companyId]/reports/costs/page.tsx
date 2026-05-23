import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";
import type { ProductionBatchStatus } from "@/types/database";

interface PageProps {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}

type BatchRow = {
  id: string;
  batch_number: string;
  status: ProductionBatchStatus;
  actual_quantity: number | null;
  planned_quantity: number;
  uom: string;
  completed_at: string | null;
  cost_total: number | null;
  cost_currency: string | null;
  production_orders: {
    id: string;
    code: string;
    finished_material_id: string;
    materials: { code: string; name: string; base_uom: string } | null;
  } | null;
};

type SnapshotRow = {
  production_batch_id: string;
  material_id: string;
  quantity: number;
  line_cost: number | null;
  currency: string | null;
  materials: { code: string; name: string; base_uom: string } | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function formatNumber(n: number, max = 2): string {
  return Number(n).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: max,
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseRange(from: string | undefined, to: string | undefined) {
  const now = new Date();
  const todayIso = toIsoDate(now);
  const thirtyAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const safeFrom = from && ISO_DATE.test(from) ? from : toIsoDate(thirtyAgo);
  const safeTo = to && ISO_DATE.test(to) ? to : todayIso;
  const fromAt = `${safeFrom}T00:00:00.000Z`;
  const toAt = `${safeTo}T23:59:59.999Z`;
  return { from: safeFrom, to: safeTo, fromAt, toAt };
}

export default async function CostsReportPage({
  params,
  searchParams,
}: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { from, to } = await searchParams;
  const { companyId } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const range = parseRange(from, to);

  const { data: batches } = await supabase
    .from("production_batches")
    .select(
      "id, batch_number, status, actual_quantity, planned_quantity, uom, " +
        "completed_at, cost_total, cost_currency, " +
        "production_orders:production_order_id(" +
        "id, code, finished_material_id, " +
        "materials:finished_material_id(code, name, base_uom))",
    )
    .eq("company_id", companyId)
    .in("status", ["completed", "closed"])
    .not("completed_at", "is", null)
    .gte("completed_at", range.fromAt)
    .lte("completed_at", range.toAt)
    .is("deleted_at", null)
    .order("completed_at", { ascending: false })
    .returns<BatchRow[]>();

  const batchRows = batches ?? [];
  const batchIds = batchRows.map((b) => b.id);

  const { data: snapshots } =
    batchIds.length > 0
      ? await supabase
          .from("cost_snapshots")
          .select(
            "production_batch_id, material_id, quantity, line_cost, currency, " +
              "materials:material_id(code, name, base_uom)",
          )
          .eq("company_id", companyId)
          .in("production_batch_id", batchIds)
          .returns<SnapshotRow[]>()
      : { data: [] as SnapshotRow[] };

  const snapshotRows = snapshots ?? [];

  type Bucket = { total: number; count: number };
  const totalByCurrency = new Map<string, Bucket>();
  for (const b of batchRows) {
    if (b.cost_total === null) continue;
    const cur = b.cost_currency ?? "—";
    const bucket = totalByCurrency.get(cur) ?? { total: 0, count: 0 };
    bucket.total += Number(b.cost_total);
    bucket.count += 1;
    totalByCurrency.set(cur, bucket);
  }
  const totalsList = Array.from(totalByCurrency.entries()).sort(
    (a, b) => b[1].total - a[1].total,
  );

  type ProductAgg = {
    materialId: string;
    code: string;
    name: string;
    baseUom: string;
    currency: string;
    batches: number;
    totalQty: number;
    totalCost: number;
  };
  const productMap = new Map<string, ProductAgg>();
  for (const b of batchRows) {
    const order = b.production_orders;
    const mat = order?.materials;
    if (!order || !mat || b.cost_total === null) continue;
    const cur = b.cost_currency ?? "—";
    const key = `${order.finished_material_id}__${cur}`;
    const qty = Number(b.actual_quantity ?? b.planned_quantity);
    const cost = Number(b.cost_total);
    const existing = productMap.get(key);
    if (existing) {
      existing.batches += 1;
      existing.totalQty += qty;
      existing.totalCost += cost;
    } else {
      productMap.set(key, {
        materialId: order.finished_material_id,
        code: mat.code,
        name: mat.name,
        baseUom: mat.base_uom,
        currency: cur,
        batches: 1,
        totalQty: qty,
        totalCost: cost,
      });
    }
  }
  const productRows = Array.from(productMap.values()).sort(
    (a, b) => b.totalCost - a.totalCost,
  );

  type MaterialAgg = {
    materialId: string;
    code: string;
    name: string;
    baseUom: string;
    currency: string;
    totalQty: number;
    totalLineCost: number;
  };
  const materialMap = new Map<string, MaterialAgg>();
  for (const s of snapshotRows) {
    if (!s.materials || s.line_cost === null) continue;
    const cur = s.currency ?? "—";
    const key = `${s.material_id}__${cur}`;
    const qty = Number(s.quantity);
    const cost = Number(s.line_cost);
    const existing = materialMap.get(key);
    if (existing) {
      existing.totalQty += qty;
      existing.totalLineCost += cost;
    } else {
      materialMap.set(key, {
        materialId: s.material_id,
        code: s.materials.code,
        name: s.materials.name,
        baseUom: s.materials.base_uom,
        currency: cur,
        totalQty: qty,
        totalLineCost: cost,
      });
    }
  }
  const materialRows = Array.from(materialMap.values())
    .sort((a, b) => b.totalLineCost - a.totalLineCost)
    .slice(0, 20);

  const reportsHref = companyModulePath(companyId, "reports");

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          <Link href={reportsHref} className="hover:underline">
            ← Raporlar
          </Link>
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Maliyet Detayı
            </h1>
            <p className="text-sm text-muted-foreground">
              Seçilen tarih aralığında tamamlanan üretim partilerinin maliyet
              dökümü. Lot birim maliyetleri parti tamamlandığında dondurulur;
              bu sayfa o anlık görüntüleri toplayarak gösterir.
            </p>
          </div>
        </div>
      </header>

      <section className="rounded-md border border-border bg-card/40 p-4">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <div className="space-y-1">
            <Label htmlFor="from">Başlangıç</Label>
            <Input
              id="from"
              name="from"
              type="date"
              defaultValue={range.from}
              className="w-44"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to">Bitiş</Label>
            <Input
              id="to"
              name="to"
              type="date"
              defaultValue={range.to}
              className="w-44"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit">Uygula</Button>
            <Link href={companyModulePath(companyId, "reports", "costs")}>
              <Button type="button" variant="outline">
                Sıfırla
              </Button>
            </Link>
          </div>
        </form>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {totalsList.length > 0 ? (
          totalsList.map(([cur, bucket]) => (
            <article
              key={cur}
              className="rounded-md border border-border bg-card p-4"
            >
              <p className="text-xs text-muted-foreground">
                Dönem Toplam Maliyet
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatNumber(bucket.total)}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  {cur}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {bucket.count} parti
              </p>
            </article>
          ))
        ) : (
          <article className="rounded-md border border-border bg-card p-4 sm:col-span-2 lg:col-span-3">
            <p className="text-xs text-muted-foreground">Dönem Toplam</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">—</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Bu aralıkta tamamlanan maliyetli parti yok.
            </p>
          </article>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Bitmiş Ürün Bazlı
          </h2>
          <p className="text-xs text-muted-foreground">
            Her bitmiş ürün için aralıktaki toplam üretim, maliyet ve ortalama
            birim maliyet. Farklı para birimleri ayrı satır olarak listelenir.
          </p>
        </div>
        {productRows.length > 0 ? (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Bitmiş Ürün</th>
                  <th className="px-3 py-2 text-right font-medium">Parti</th>
                  <th className="px-3 py-2 text-right font-medium">Üretim</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Toplam Maliyet
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Ort. Birim Maliyet
                  </th>
                </tr>
              </thead>
              <tbody>
                {productRows.map((p) => {
                  const avgUnit = p.totalQty > 0 ? p.totalCost / p.totalQty : 0;
                  return (
                    <tr
                      key={`${p.materialId}-${p.currency}`}
                      className="border-t border-border align-top"
                    >
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs">{p.code}</span>
                        <span className="ml-1">— {p.name}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {p.batches}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {formatNumber(p.totalQty)} {p.baseUom}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {formatNumber(p.totalCost)} {p.currency}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {formatNumber(avgUnit, 4)} {p.currency} / {p.baseUom}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Bu aralıkta maliyetli üretim yok.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            En Çok Harcanan Malzemeler
          </h2>
          <p className="text-xs text-muted-foreground">
            Aralıktaki partilerin tükettiği malzemeler, satır maliyetine göre
            sıralı. En fazla 20 kalem gösterilir.
          </p>
        </div>
        {materialRows.length > 0 ? (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Malzeme</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Toplam Miktar
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Toplam Maliyet
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Ort. Birim
                  </th>
                </tr>
              </thead>
              <tbody>
                {materialRows.map((m) => {
                  const avgUnit =
                    m.totalQty > 0 ? m.totalLineCost / m.totalQty : 0;
                  return (
                    <tr
                      key={`${m.materialId}-${m.currency}`}
                      className="border-t border-border align-top"
                    >
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs">{m.code}</span>
                        <span className="ml-1">— {m.name}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {formatNumber(m.totalQty)} {m.baseUom}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {formatNumber(m.totalLineCost)} {m.currency}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {formatNumber(avgUnit, 4)} {m.currency} / {m.baseUom}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Bu aralıkta tüketim kaydı yok.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Tamamlanan Partiler
          </h2>
          <p className="text-xs text-muted-foreground">
            Aralıktaki partiler, en yeniden eskiye. Parti detayı için emir
            kodunu tıklayın.
          </p>
        </div>
        {batchRows.length > 0 ? (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Emir</th>
                  <th className="px-3 py-2 text-left font-medium">Parti</th>
                  <th className="px-3 py-2 text-left font-medium">Bitmiş Ürün</th>
                  <th className="px-3 py-2 text-right font-medium">Miktar</th>
                  <th className="px-3 py-2 text-right font-medium">Maliyet</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Tamamlanma
                  </th>
                </tr>
              </thead>
              <tbody>
                {batchRows.map((b) => {
                  const order = b.production_orders;
                  const mat = order?.materials;
                  const qty = Number(b.actual_quantity ?? b.planned_quantity);
                  return (
                    <tr
                      key={b.id}
                      className="border-t border-border align-top"
                    >
                      <td className="px-3 py-2 font-mono text-xs">
                        {order ? (
                          <Link
                            href={companyModulePath(
                              companyId,
                              "production",
                              order.id,
                            )}
                            className="hover:underline"
                          >
                            {order.code}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {b.batch_number}
                      </td>
                      <td className="px-3 py-2">
                        {mat ? (
                          <span>
                            <span className="font-mono text-xs">
                              {mat.code}
                            </span>
                            <span className="ml-1">— {mat.name}</span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {formatNumber(qty)} {b.uom}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {b.cost_total !== null
                          ? `${formatNumber(Number(b.cost_total))} ${b.cost_currency ?? ""}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {formatDateTime(b.completed_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Bu aralıkta parti yok"
            description="Tarih aralığını değiştirerek geçmiş üretimleri inceleyebilirsiniz."
          />
        )}
      </section>
    </div>
  );
}
