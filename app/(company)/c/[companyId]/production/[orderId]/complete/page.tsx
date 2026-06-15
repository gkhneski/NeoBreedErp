import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyRole, requireModuleAccess } from "@/lib/auth";
import type { LocationOption } from "@/lib/locations";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { convertQuantity } from "@/lib/uom";
import { PRODUCTION_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { updateLotStatus } from "../../../lots/actions";
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

  const { data: locationRows } = await supabase
    .from("locations")
    .select("id, code, name, kind, parent_id, is_default")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("code")
    .returns<LocationOption[]>();
  const locations = locationRows ?? [];
  const defaultLocationId =
    locations.find((l) => l.is_default)?.id ?? locations[0]?.id ?? null;

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

  const formItems = recipeItems.map((item) => {
    const baseUom = item.materials?.base_uom ?? item.uom;
    // Recipe is authored in item.uom (e.g. g) but stock lots are in the
    // material base unit (e.g. kg). Consume in the lot's unit so it can't go
    // negative. Fall back to no conversion for incompatible/unknown units.
    const perRecipeUnit = convertQuantity(1, item.uom, baseUom);
    const factor = perRecipeUnit ?? 1;
    const displayUom = perRecipeUnit !== null ? baseUom : item.uom;
    return {
    recipe_item_id: item.id,
    position: item.position,
    material_id: item.material_id,
    material_code: item.materials?.code ?? "",
    material_name: item.materials?.name ?? "",
    base_uom: baseUom,
    recipe_quantity: Number(item.quantity),
    uom: displayUom,
    planned_consumption: Number(item.quantity) * baseScaleFactor * factor,
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
    };
  });

  const allItemsHaveLots = formItems.every((i) => i.lots.length > 0);

  // Missing materials + their quarantine lots, so they can be released inline.
  let releaseCandidates: Array<{
    material_id: string;
    material_code: string;
    material_name: string;
    base_uom: string;
    lots: Array<{ id: string; lot_number: string; quantity_on_hand: number }>;
  }> = [];
  if (!allItemsHaveLots) {
    const missing = formItems.filter((i) => i.lots.length === 0);
    const { data: quarantineLots } = await supabase
      .from("material_lots")
      .select("id, material_id, lot_number, quantity_on_hand")
      .eq("company_id", companyId)
      .eq("status", "quarantine")
      .gt("quantity_on_hand", 0)
      .in("material_id", missing.map((i) => i.material_id))
      .is("deleted_at", null)
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .returns<Array<{ id: string; material_id: string; lot_number: string; quantity_on_hand: number }>>();
    releaseCandidates = missing.map((i) => ({
      material_id: i.material_id,
      material_code: i.material_code,
      material_name: i.material_name,
      base_uom: i.base_uom,
      lots: (quarantineLots ?? [])
        .filter((l) => l.material_id === i.material_id)
        .map((l) => ({
          id: l.id,
          lot_number: l.lot_number,
          quantity_on_hand: Number(l.quantity_on_hand),
        })),
    }));
  }

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
          locations={locations}
          defaultLocationId={defaultLocationId}
        />
      ) : (
        <div className="space-y-4">
          <EmptyState
            title="Yeterli serbest lot yok"
            description="Her aktif reçete kalemi için en az bir 'serbest' (released) lot olmalı. Aşağıdaki karantina lotlarını tek tıkla serbest bırakıp tekrar deneyin."
          />

          <section className="space-y-3">
            {releaseCandidates.map((rc) => (
              <div
                key={rc.material_id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <p className="text-sm font-medium">
                  <span className="font-mono text-xs text-muted-foreground">
                    {rc.material_code}
                  </span>{" "}
                  {rc.material_name}
                </p>
                {rc.lots.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {rc.lots.map((lot) => (
                      <form key={lot.id} action={updateLotStatus}>
                        <input type="hidden" name="company_id" value={companyId} />
                        <input type="hidden" name="lot_id" value={lot.id} />
                        <input type="hidden" name="status" value="released" />
                        <Button type="submit" size="sm" variant="outline">
                          Serbest Bırak — lot{" "}
                          <span className="font-mono">{lot.lot_number}</span> (
                          {lot.quantity_on_hand.toLocaleString("tr-TR")}{" "}
                          {rc.base_uom})
                        </Button>
                      </form>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-destructive">
                    QC bekleyen (karantina) lot yok. Önce mal kabul edip stok
                    girin.
                  </p>
                )}
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
