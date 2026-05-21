import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";
import type {
  ProductionBatchStatus,
  ProductionOrderStatus,
} from "@/types/database";

import { cancelProductionOrder, planProductionOrder } from "../actions";
import { StartBatchForm } from "./start-batch-form";

interface PageProps {
  params: Promise<{ companyId: string; orderId: string }>;
}

type OrderDetail = {
  id: string;
  code: string;
  status: ProductionOrderStatus;
  planned_quantity: number;
  planned_uom: string;
  planned_start_at: string | null;
  planned_end_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  finished_material_id: string;
  recipe_id: string;
  materials: { code: string; name: string; base_uom: string } | null;
  recipes: {
    code: string;
    name: string;
    version: number;
    mode: "quantity" | "percentage";
    yield_quantity: number;
    yield_uom: string;
  } | null;
};

type RecipeItemRow = {
  id: string;
  position: number;
  quantity: number;
  uom: string;
  percentage: number | null;
  active: boolean;
  notes: string | null;
  materials: { code: string; name: string; base_uom: string } | null;
};

type BatchRow = {
  id: string;
  batch_number: string;
  status: ProductionBatchStatus;
  planned_quantity: number;
  actual_quantity: number | null;
  uom: string;
  started_at: string | null;
  completed_at: string | null;
  cost_total: number | null;
  cost_currency: string | null;
  output_lot_id: string | null;
  material_lots: { lot_number: string; status: string } | null;
};

type CostSnapshotRow = {
  id: string;
  production_batch_id: string;
  quantity: number;
  unit_cost: number | null;
  currency: string | null;
  line_cost: number | null;
  materials: { code: string; name: string; base_uom: string } | null;
  material_lots: { lot_number: string } | null;
};

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

const BATCH_STATUS_LABEL: Record<ProductionBatchStatus, string> = {
  in_progress: "Üretimde",
  completed: "Tamamlandı",
  closed: "Kapatıldı",
  cancelled: "İptal",
};

const BATCH_STATUS_VARIANT: Record<
  ProductionBatchStatus,
  "default" | "secondary" | "outline" | "warning" | "destructive" | "success"
> = {
  in_progress: "warning",
  completed: "success",
  closed: "secondary",
  cancelled: "destructive",
};

function formatNumber(n: number, max = 6): string {
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

export default async function ProductionOrderDetailPage({ params }: PageProps) {
  const { companyId: routeCompanyId, orderId } = await params;
  const { companyId } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const { data: order } = await supabase
    .from("production_orders")
    .select(
      "id, code, status, planned_quantity, planned_uom, planned_start_at, planned_end_at, " +
        "started_at, completed_at, closed_at, cancelled_at, notes, created_at, updated_at, " +
        "finished_material_id, recipe_id, " +
        "materials:finished_material_id(code, name, base_uom), " +
        "recipes:recipe_id(code, name, version, mode, yield_quantity, yield_uom)",
    )
    .eq("id", orderId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle<OrderDetail>();

  if (!order) notFound();

  const [{ data: items }, { data: batches }] = await Promise.all([
    supabase
      .from("recipe_items")
      .select(
        "id, position, quantity, uom, percentage, active, notes, " +
          "materials:material_id(code, name, base_uom)",
      )
      .eq("recipe_id", order.recipe_id)
      .order("position", { ascending: true })
      .returns<RecipeItemRow[]>(),
    supabase
      .from("production_batches")
      .select(
        "id, batch_number, status, planned_quantity, actual_quantity, uom, " +
          "started_at, completed_at, cost_total, cost_currency, output_lot_id, " +
          "material_lots:output_lot_id(lot_number, status)",
      )
      .eq("company_id", companyId)
      .eq("production_order_id", orderId)
      .is("deleted_at", null)
      .order("started_at", { ascending: false })
      .returns<BatchRow[]>(),
  ]);

  const recipe = order.recipes;
  const recipeItems = items ?? [];
  const orderBatches = batches ?? [];
  const activeBatch = orderBatches.find((b) => b.status === "in_progress");

  const costedBatchIds = orderBatches
    .filter((b) => b.status === "completed" || b.status === "closed")
    .map((b) => b.id);

  const costSnapshotsByBatch = new Map<string, CostSnapshotRow[]>();
  if (costedBatchIds.length > 0) {
    const { data: snapshots } = await supabase
      .from("cost_snapshots")
      .select(
        "id, production_batch_id, quantity, unit_cost, currency, line_cost, " +
          "materials:material_id(code, name, base_uom), " +
          "material_lots:lot_id(lot_number)",
      )
      .eq("company_id", companyId)
      .in("production_batch_id", costedBatchIds)
      .order("created_at", { ascending: true })
      .returns<CostSnapshotRow[]>();

    for (const row of snapshots ?? []) {
      const list = costSnapshotsByBatch.get(row.production_batch_id) ?? [];
      list.push(row);
      costSnapshotsByBatch.set(row.production_batch_id, list);
    }
  }

  const scaleFactor =
    recipe && Number(recipe.yield_quantity) > 0
      ? Number(order.planned_quantity) / Number(recipe.yield_quantity)
      : 0;

  const canPlan = order.status === "draft";
  const canStart = order.status === "planned";
  const canCancel = order.status === "draft" || order.status === "planned";
  const canComplete = order.status === "in_progress" && activeBatch;

  const defaultBatchNumber = `${order.code}-B${orderBatches.length + 1}`;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          <Link
            href={companyModulePath(companyId, "production")}
            className="hover:underline"
          >
            ← Üretim Emirleri
          </Link>
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              {order.code}
            </h1>
            <p className="text-sm text-muted-foreground">
              {order.materials ? (
                <>
                  <span className="font-mono">{order.materials.code}</span> —{" "}
                  {order.materials.name}
                </>
              ) : (
                "—"
              )}{" "}
              ·{" "}
              {recipe ? (
                <>
                  Reçete <span className="font-mono">{recipe.code}</span> v
                  {recipe.version}
                </>
              ) : (
                "Reçete bulunamadı"
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[order.status]}>
              {STATUS_LABEL[order.status]}
            </Badge>
            {canPlan ? (
              <form action={planProductionOrder.bind(null, companyId)}>
                <input type="hidden" name="order_id" value={order.id} />
                <Button type="submit">Planla</Button>
              </form>
            ) : null}
            {canComplete ? (
              <Link
                href={companyModulePath(
                  companyId,
                  "production",
                  order.id,
                  "complete",
                )}
              >
                <Button>Tamamla</Button>
              </Link>
            ) : null}
            {canCancel ? (
              <form action={cancelProductionOrder.bind(null, companyId)}>
                <input type="hidden" name="order_id" value={order.id} />
                <Button type="submit" variant="outline">
                  İptal Et
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      </header>

      <section className="grid gap-3 rounded-md border border-border bg-card/40 p-4 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Hedef Miktar
          </p>
          <p className="font-mono">
            {formatNumber(Number(order.planned_quantity))} {order.planned_uom}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Planlanan Başlangıç
          </p>
          <p>{formatDateTime(order.planned_start_at)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Planlanan Bitiş
          </p>
          <p>{formatDateTime(order.planned_end_at)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Başlama
          </p>
          <p>{formatDateTime(order.started_at)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Tamamlanma
          </p>
          <p>{formatDateTime(order.completed_at)}</p>
        </div>
        {order.cancelled_at ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              İptal Tarihi
            </p>
            <p>{formatDateTime(order.cancelled_at)}</p>
          </div>
        ) : null}
      </section>

      {order.notes ? (
        <section className="rounded-md border border-border bg-card/40 p-4 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Notlar
          </p>
          <p className="mt-1 whitespace-pre-wrap">{order.notes}</p>
        </section>
      ) : null}

      {canStart ? (
        <section className="space-y-2 rounded-md border border-border bg-card/40 p-4">
          <h2 className="text-sm font-semibold">Üretime Al</h2>
          <p className="text-xs text-muted-foreground">
            Bu emri bir üretim partisine bağlayın. Parti açıldıktan sonra emir
            iptal edilemez; düzeltme yalnızca stok hareketi ile yapılır.
          </p>
          <StartBatchForm
            companyId={companyId}
            orderId={order.id}
            defaultBatchNumber={defaultBatchNumber}
          />
        </section>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Partiler</h2>
          <p className="text-xs text-muted-foreground">
            Bu emir için açılmış üretim partileri. Tamamlanmış parti, çıkış
            lotunu ve maliyet anlık görüntüsünü içerir.
          </p>
        </div>
        {orderBatches.length > 0 ? (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Parti</th>
                  <th className="px-3 py-2 text-left font-medium">Durum</th>
                  <th className="px-3 py-2 text-right font-medium">Planlı</th>
                  <th className="px-3 py-2 text-right font-medium">Gerçek</th>
                  <th className="px-3 py-2 text-left font-medium">Çıkış Lot</th>
                  <th className="px-3 py-2 text-right font-medium">Maliyet</th>
                  <th className="px-3 py-2 text-left font-medium">Başlangıç</th>
                  <th className="px-3 py-2 text-left font-medium">Bitiş</th>
                </tr>
              </thead>
              <tbody>
                {orderBatches.map((b) => (
                  <tr key={b.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-mono text-xs">
                      {b.batch_number}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={BATCH_STATUS_VARIANT[b.status]}>
                        {BATCH_STATUS_LABEL[b.status]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {formatNumber(Number(b.planned_quantity))} {b.uom}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {b.actual_quantity !== null
                        ? `${formatNumber(Number(b.actual_quantity))} ${b.uom}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {b.output_lot_id && b.material_lots ? (
                        <Link
                          href={companyModulePath(companyId, "lots")}
                          className="font-mono hover:underline"
                        >
                          {b.material_lots.lot_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {b.cost_total !== null
                        ? `${formatNumber(Number(b.cost_total), 4)} ${b.cost_currency ?? ""}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatDateTime(b.started_at)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatDateTime(b.completed_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Henüz bir parti açılmadı.
          </p>
        )}
      </section>

      {costedBatchIds.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Maliyet Dökümü
            </h2>
            <p className="text-xs text-muted-foreground">
              Parti tamamlandığında, tüketilen her lotun o andaki birim maliyeti
              dondurulur. Lot birim maliyeti sonradan değişse bile bu döküm
              değişmez (ERP_RULES §7).
            </p>
          </div>
          <div className="space-y-4">
            {orderBatches
              .filter(
                (b) => b.status === "completed" || b.status === "closed",
              )
              .map((batch) => {
                const lines = costSnapshotsByBatch.get(batch.id) ?? [];
                const hasCost = batch.cost_total !== null;
                return (
                  <div
                    key={batch.id}
                    className="overflow-hidden rounded-md border border-border bg-card/40"
                  >
                    <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border bg-secondary/30 px-4 py-2">
                      <div>
                        <p className="font-mono text-sm">{batch.batch_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {batch.actual_quantity !== null
                            ? `${formatNumber(Number(batch.actual_quantity))} ${batch.uom}`
                            : `${formatNumber(Number(batch.planned_quantity))} ${batch.uom}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Toplam Maliyet
                        </p>
                        <p className="font-mono text-sm">
                          {hasCost
                            ? `${formatNumber(Number(batch.cost_total), 4)} ${batch.cost_currency ?? ""}`
                            : "—"}
                          {hasCost &&
                          batch.actual_quantity !== null &&
                          Number(batch.actual_quantity) > 0 ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              (≈{" "}
                              {formatNumber(
                                Number(batch.cost_total) /
                                  Number(batch.actual_quantity),
                                4,
                              )}{" "}
                              {batch.cost_currency ?? ""} / {batch.uom})
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    {lines.length > 0 ? (
                      <table className="w-full text-sm">
                        <thead className="bg-secondary/20 text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">
                              Malzeme
                            </th>
                            <th className="px-3 py-2 text-left font-medium">
                              Lot
                            </th>
                            <th className="px-3 py-2 text-right font-medium">
                              Miktar
                            </th>
                            <th className="px-3 py-2 text-right font-medium">
                              Birim Maliyet
                            </th>
                            <th className="px-3 py-2 text-right font-medium">
                              Satır Maliyeti
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((line) => (
                            <tr
                              key={line.id}
                              className="border-t border-border align-top"
                            >
                              <td className="px-3 py-2">
                                {line.materials ? (
                                  <span>
                                    <span className="font-mono text-xs">
                                      {line.materials.code}
                                    </span>
                                    <span className="ml-1">
                                      — {line.materials.name}
                                    </span>
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="px-3 py-2 font-mono text-xs">
                                {line.material_lots?.lot_number ?? "—"}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-xs">
                                {formatNumber(Number(line.quantity))}{" "}
                                {line.materials?.base_uom ?? ""}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-xs">
                                {line.unit_cost !== null
                                  ? `${formatNumber(Number(line.unit_cost), 4)} ${line.currency ?? ""}`
                                  : "—"}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-xs">
                                {line.line_cost !== null
                                  ? `${formatNumber(Number(line.line_cost), 4)} ${line.currency ?? ""}`
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="px-4 py-3 text-xs text-muted-foreground">
                        Bu parti, maliyet dökümü tablosu eklenmeden önce
                        tamamlanmış. Toplam maliyet üst başlıkta gösteriliyor.
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Reçete Kalemleri (Ölçeklenmiş Önizleme)
            </h2>
            <p className="text-xs text-muted-foreground">
              {recipe ? (
                <>
                  Reçete verimi{" "}
                  <span className="font-mono">
                    {formatNumber(Number(recipe.yield_quantity))}
                  </span>{" "}
                  {recipe.yield_uom}; bu emir{" "}
                  <span className="font-mono">
                    ×{formatNumber(scaleFactor, 4)}
                  </span>{" "}
                  ölçek ile gösteriliyor. Gerçek tüketim partinin tamamlanması
                  sırasında lot bazında girilir.
                </>
              ) : (
                "Reçete bulunamadı."
              )}
            </p>
          </div>
        </div>

        {recipeItems.length > 0 ? (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Malzeme</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Reçete Miktarı
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Bu Emir İçin
                  </th>
                  <th className="px-3 py-2 text-right font-medium">%</th>
                  <th className="px-3 py-2 text-left font-medium">Aktif</th>
                </tr>
              </thead>
              <tbody>
                {recipeItems.map((item) => {
                  const scaled = Number(item.quantity) * scaleFactor;
                  return (
                    <tr
                      key={item.id}
                      className={
                        "border-t border-border align-top " +
                        (item.active ? "" : "opacity-60")
                      }
                    >
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {item.position}
                      </td>
                      <td className="px-3 py-2">
                        {item.materials ? (
                          <span>
                            <span className="font-mono text-xs">
                              {item.materials.code}
                            </span>
                            <span className="ml-1">
                              — {item.materials.name}
                            </span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {formatNumber(Number(item.quantity))} {item.uom}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {formatNumber(scaled)} {item.uom}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {item.percentage !== null
                          ? `${formatNumber(Number(item.percentage), 4)}%`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {item.active ? (
                          <Badge variant="default">Aktif</Badge>
                        ) : (
                          <Badge variant="secondary">İnaktif</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Bu reçetede kalem bulunmuyor.
          </p>
        )}
      </section>
    </div>
  );
}
