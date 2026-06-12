import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyRole, requireModuleAccess } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PRODUCTION_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { CompleteBatchForm } from "./complete-form";

interface PageProps {
  params: Promise<{ companyId: string; orderId: string }>;
}

type OrderRow = {
  id: string;
  code: string;
  status: string;
  planned_quantity: number;
  planned_uom: string;
  finished_material_id: string;
  recipe_id: string;
  materials: { code: string; name: string; base_uom: string } | null;
  recipes: {
    code: string;
    name: string;
    version: number;
    yield_quantity: number;
    yield_uom: string;
  } | null;
};

type BatchRow = {
  id: string;
  batch_number: string;
  status: string;
  planned_quantity: number;
  uom: string;
};

type RecipeItemRow = {
  id: string;
  position: number;
  material_id: string;
  quantity: number;
  uom: string;
  active: boolean;
  materials: { code: string; name: string; base_uom: string } | null;
};

type LotRow = {
  id: string;
  material_id: string;
  lot_number: string;
  expiry_date: string | null;
  quantity_on_hand: number;
  unit_cost: number | null;
  currency: string | null;
};

export default async function CompleteBatchPage({ params }: PageProps) {
  const { companyId: routeCompanyId, orderId } = await params;
  await requireModuleAccess(routeCompanyId, "production");
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    PRODUCTION_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: order } = await supabase
    .from("production_orders")
    .select(
      "id, code, status, planned_quantity, planned_uom, finished_material_id, recipe_id, " +
        "materials:finished_material_id(code, name, base_uom), " +
        "recipes:recipe_id(code, name, version, yield_quantity, yield_uom)",
    )
    .eq("id", orderId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle<OrderRow>();

  if (!order) notFound();

  if (order.status !== "in_progress") {
    redirect(companyModulePath(companyId, "production", order.id));
  }

  const [{ data: batch }, { data: items }] = await Promise.all([
    supabase
      .from("production_batches")
      .select("id, batch_number, status, planned_quantity, uom")
      .eq("company_id", companyId)
      .eq("production_order_id", orderId)
      .eq("status", "in_progress")
      .is("deleted_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle<BatchRow>(),
    supabase
      .from("recipe_items")
      .select(
        "id, position, material_id, quantity, uom, active, " +
          "materials:material_id(code, name, base_uom)",
      )
      .eq("recipe_id", order.recipe_id)
      .eq("active", true)
      .order("position", { ascending: true })
      .returns<RecipeItemRow[]>(),
  ]);

  if (!batch) {
    redirect(companyModulePath(companyId, "production", order.id));
  }

  const recipeItems = items ?? [];
  const materialIds = Array.from(new Set(recipeItems.map((i) => i.material_id)));

  let lots: LotRow[] = [];
  if (materialIds.length > 0) {
    const { data } = await supabase
      .from("material_lots")
      .select(
        "id, material_id, lot_number, expiry_date, quantity_on_hand, unit_cost, currency",
      )
      .eq("company_id", companyId)
      .eq("status", "released")
      .gt("quantity_on_hand", 0)
      .in("material_id", materialIds)
      .is("deleted_at", null)
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .returns<LotRow[]>();
    lots = data ?? [];
  }

  const recipe = order.recipes;
  const baseScaleFactor =
    recipe && Number(recipe.yield_quantity) > 0
      ? Number(order.planned_quantity) / Number(recipe.yield_quantity)
      : 0;

  const formItems = recipeItems.map((item) => ({
    recipe_item_id: item.id,
    position: item.position,
    material_id: item.material_id,
    material_code: item.materials?.code ?? "",
    material_name: item.materials?.name ?? "",
    base_uom: item.materials?.base_uom ?? item.uom,
    recipe_quantity: Number(item.quantity),
    uom: item.uom,
    planned_consumption: Number(item.quantity) * baseScaleFactor,
    lots: lots
      .filter((l) => l.material_id === item.material_id)
      .map((l) => ({
        id: l.id,
        lot_number: l.lot_number,
        expiry_date: l.expiry_date,
        quantity_on_hand: Number(l.quantity_on_hand),
        unit_cost: l.unit_cost !== null ? Number(l.unit_cost) : null,
        currency: l.currency,
      })),
  }));

  const allItemsHaveLots = formItems.every((i) => i.lots.length > 0);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          <Link
            href={companyModulePath(companyId, "production", order.id)}
            className="hover:underline"
          >
            ← Üretim Emri{" "}
            <span className="font-mono">{order.code}</span>
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Partiyi Tamamla
        </h1>
        <p className="text-sm text-muted-foreground">
          Aktif parti{" "}
          <span className="font-mono">{batch.batch_number}</span>. Her aktif
          reçete kalemi için bir lot seçip tüketim miktarını giriniz; çıkış
          ürünü için yeni bir lot numarası belirtin. Tüm bunlar tek bir DB
          işleminde gerçekleşir.
        </p>
      </header>

      {allItemsHaveLots ? (
        <CompleteBatchForm
          companyId={companyId}
          orderId={order.id}
          batchId={batch.id}
          batchNumber={batch.batch_number}
          orderCode={order.code}
          plannedQuantity={Number(order.planned_quantity)}
          plannedUom={order.planned_uom}
          outputBaseUom={order.materials?.base_uom ?? order.planned_uom}
          items={formItems}
        />
      ) : (
        <EmptyState
          title="Yeterli serbest lot yok"
          description="Her aktif reçete kalemi için en az bir 'serbest' (released) lot olmalı. Eksik lotları QC'den geçirip serbest bırakın."
        />
      )}
    </div>
  );
}
