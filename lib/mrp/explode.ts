import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

// Two-level (or deeper) MRP: explode open finished-goods demand through published
// recipes, net against on-hand stock level by level, and split the result into
// production needs (materials that have a recipe) and purchase needs (materials
// that do not). Netting uses low-level codes so shared components net once.

export type MaterialMeta = {
  id: string;
  code: string;
  name: string;
  type: "raw" | "semi" | "finished";
  base_uom: string;
  default_supplier_id: string | null;
  fason_customer_id: string | null;
};

export type RecipeMeta = {
  recipeId: string;
  outputMaterialId: string;
  yieldQuantity: number;
  yieldUom: string;
  items: Array<{ materialId: string; quantity: number; uom: string }>;
};

export type MrpProduction = {
  materialId: string;
  code: string;
  name: string;
  uom: string;
  recipeId: string;
  recipeYieldUom: string;
  level: "finished" | "semi";
  grossQuantity: number;
  stockQuantity: number;
  produceQuantity: number;
};

export type MrpPurchase = {
  materialId: string;
  code: string;
  name: string;
  uom: string;
  grossQuantity: number;
  stockQuantity: number;
  buyQuantity: number;
  supplierId: string | null;
  supplierName: string | null;
  unitCost: number | null;
};

export type MrpDemandLine = {
  materialId: string;
  code: string;
  name: string;
  quantity: number;
};

export type MrpPlan = {
  demand: MrpDemandLine[];
  production: MrpProduction[]; // ordered: deepest (semi) first, then finished
  purchases: MrpPurchase[]; // grouped per material; sortable by supplier in UI
  openOrders: number;
  hasDemand: boolean;
};

type PlanInput = {
  demand: Map<string, number>;
  materials: Map<string, MaterialMeta>;
  recipeByOutput: Map<string, RecipeMeta>;
  stock: Map<string, number>;
  suppliers: Map<string, string>;
  unitCost: Map<string, number>;
};

// Low-level code = longest distance from any demand root down to the material.
function computeLevels(
  demand: Map<string, number>,
  recipeByOutput: Map<string, RecipeMeta>,
): Map<string, number> {
  const level = new Map<string, number>();
  const visit = (materialId: string, depth: number, path: Set<string>) => {
    if (path.has(materialId)) return; // cycle guard
    const current = level.get(materialId) ?? -1;
    if (depth > current) level.set(materialId, depth);
    const recipe = recipeByOutput.get(materialId);
    if (!recipe) return;
    const next = new Set(path).add(materialId);
    for (const item of recipe.items) visit(item.materialId, depth + 1, next);
  };
  for (const materialId of demand.keys()) visit(materialId, 0, new Set());
  return level;
}

export function planMrp(input: PlanInput): {
  production: MrpProduction[];
  purchases: MrpPurchase[];
} {
  const { demand, materials, recipeByOutput, stock, suppliers, unitCost } = input;

  const gross = new Map<string, number>();
  for (const [materialId, qty] of demand) {
    gross.set(materialId, (gross.get(materialId) ?? 0) + qty);
  }

  const levels = computeLevels(demand, recipeByOutput);
  // Make sure every referenced material has a level entry.
  const ordered = [...new Set([...gross.keys(), ...levels.keys()])].sort(
    (a, b) => (levels.get(a) ?? 0) - (levels.get(b) ?? 0),
  );

  const production: MrpProduction[] = [];
  const purchases: MrpPurchase[] = [];

  for (const materialId of ordered) {
    const grossQty = gross.get(materialId) ?? 0;
    if (grossQty <= 0) continue;
    const meta = materials.get(materialId);
    const stockQty = stock.get(materialId) ?? 0;
    const net = Math.max(0, grossQty - stockQty);
    const recipe = recipeByOutput.get(materialId);

    if (recipe) {
      if (net > 0) {
        production.push({
          materialId,
          code: meta?.code ?? "?",
          name: meta?.name ?? materialId,
          uom: meta?.base_uom ?? "unit",
          recipeId: recipe.recipeId,
          recipeYieldUom: recipe.yieldUom,
          level: meta?.type === "semi" ? "semi" : "finished",
          grossQuantity: grossQty,
          stockQuantity: stockQty,
          produceQuantity: net,
        });
        const factor =
          recipe.yieldQuantity > 0 ? net / recipe.yieldQuantity : 0;
        for (const item of recipe.items) {
          gross.set(
            item.materialId,
            (gross.get(item.materialId) ?? 0) + item.quantity * factor,
          );
        }
      }
    } else {
      const buy = net;
      if (buy > 0) {
        const supplierId = meta?.default_supplier_id ?? null;
        purchases.push({
          materialId,
          code: meta?.code ?? "?",
          name: meta?.name ?? materialId,
          uom: meta?.base_uom ?? "unit",
          grossQuantity: grossQty,
          stockQuantity: stockQty,
          buyQuantity: buy,
          supplierId,
          supplierName: supplierId ? suppliers.get(supplierId) ?? null : null,
          unitCost: unitCost.get(materialId) ?? null,
        });
      }
    }
  }

  // Deepest (semi) first so YM work orders precede Mamül work orders.
  production.sort((a, b) =>
    a.level === b.level ? 0 : a.level === "semi" ? -1 : 1,
  );
  return { production, purchases };
}

// Load the live data for a company and produce the MRP plan.
export async function gatherMrpPlan(companyId: string): Promise<MrpPlan> {
  const supabase = await createServerSupabaseClient();

  // Open demand: not-yet-shipped manual/rep/portal sales orders.
  const { data: orderRows } = await supabase
    .from("sales_orders")
    .select("id, status, shipment_id, sales_order_items(material_id, quantity)")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .is("shipment_id", null)
    .in("status", ["placed", "confirmed", "preparing"])
    .returns<
      Array<{
        id: string;
        status: string;
        shipment_id: string | null;
        sales_order_items: Array<{ material_id: string; quantity: number }> | null;
      }>
    >();

  const demand = new Map<string, number>();
  let openOrders = 0;
  for (const o of orderRows ?? []) {
    let hasLine = false;
    for (const it of o.sales_order_items ?? []) {
      hasLine = true;
      demand.set(
        it.material_id,
        (demand.get(it.material_id) ?? 0) + Number(it.quantity),
      );
    }
    if (hasLine) openOrders += 1;
  }

  // Materials.
  const { data: matRows } = await supabase
    .from("materials")
    .select("id, code, name, type, base_uom, default_supplier_id, fason_customer_id")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .returns<MaterialMeta[]>();
  const materials = new Map<string, MaterialMeta>();
  for (const m of matRows ?? []) materials.set(m.id, m);

  // Published recipes + active items.
  const { data: recipeRows } = await supabase
    .from("recipes")
    .select(
      "id, finished_material_id, yield_quantity, yield_uom, " +
        "recipe_items(material_id, quantity, uom, active)",
    )
    .eq("company_id", companyId)
    .eq("status", "published")
    .is("deleted_at", null)
    .returns<
      Array<{
        id: string;
        finished_material_id: string;
        yield_quantity: number;
        yield_uom: string;
        recipe_items: Array<{
          material_id: string;
          quantity: number;
          uom: string;
          active: boolean;
        }> | null;
      }>
    >();
  const recipeByOutput = new Map<string, RecipeMeta>();
  for (const r of recipeRows ?? []) {
    recipeByOutput.set(r.finished_material_id, {
      recipeId: r.id,
      outputMaterialId: r.finished_material_id,
      yieldQuantity: Number(r.yield_quantity),
      yieldUom: r.yield_uom,
      items: (r.recipe_items ?? [])
        .filter((i) => i.active)
        .map((i) => ({
          materialId: i.material_id,
          quantity: Number(i.quantity),
          uom: i.uom,
        })),
    });
  }

  // On-hand usable stock per material: factory-owned lots, plus — for fason
  // products — the owning customer's customer-owned lots (their finished stock
  // already covers their demand, so MRP must not re-propose production).
  const { data: lotRows } = await supabase
    .from("material_lots")
    .select("material_id, quantity_on_hand, owner_customer_id")
    .eq("company_id", companyId)
    .eq("status", "released")
    .is("deleted_at", null)
    .gt("quantity_on_hand", 0);
  const stock = new Map<string, number>();
  for (const l of lotRows ?? []) {
    const owner = l.owner_customer_id as string | null;
    if (owner && owner !== materials.get(l.material_id)?.fason_customer_id) {
      continue;
    }
    stock.set(
      l.material_id,
      (stock.get(l.material_id) ?? 0) + Number(l.quantity_on_hand),
    );
  }

  // Latest known unit cost per material (hint for PO pricing).
  const { data: costRows } = await supabase
    .from("material_lots")
    .select("material_id, unit_cost, received_at")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .not("unit_cost", "is", null)
    .order("received_at", { ascending: false })
    .returns<Array<{ material_id: string; unit_cost: number | null; received_at: string | null }>>();
  const unitCost = new Map<string, number>();
  for (const c of costRows ?? []) {
    if (c.unit_cost !== null && !unitCost.has(c.material_id)) {
      unitCost.set(c.material_id, Number(c.unit_cost));
    }
  }

  // Suppliers.
  const { data: supRows } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("company_id", companyId)
    .is("deleted_at", null);
  const suppliers = new Map<string, string>();
  for (const s of supRows ?? []) suppliers.set(s.id, s.name);

  const { production, purchases } = planMrp({
    demand,
    materials,
    recipeByOutput,
    stock,
    suppliers,
    unitCost,
  });

  const demandLines: MrpDemandLine[] = [...demand.entries()].map(
    ([materialId, quantity]) => ({
      materialId,
      code: materials.get(materialId)?.code ?? "?",
      name: materials.get(materialId)?.name ?? materialId,
      quantity,
    }),
  );

  return {
    demand: demandLines,
    production,
    purchases,
    openOrders,
    hasDemand: demand.size > 0,
  };
}
