import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireCompanyRole, requireModuleAccess } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PRODUCTION_WRITE_ROLES, companyModulePath } from "@/types/roles";
import type { ProductionOrderStatus } from "@/types/database";

import { ProductionOrderForm } from "../../new/production-form";

interface PageProps {
  params: Promise<{ companyId: string; orderId: string }>;
}

type RecipeOption = {
  id: string;
  code: string;
  name: string;
  version: number;
  yield_quantity: number;
  yield_uom: string;
  finished_material_id: string;
  materials: { code: string; name: string; fason_customer_id: string | null } | null;
};

type OrderRow = {
  id: string;
  code: string;
  status: ProductionOrderStatus;
  recipe_id: string;
  customer_id: string | null;
  planned_quantity: number;
  planned_start_at: string | null;
  planned_end_at: string | null;
  notes: string | null;
};

export default async function EditProductionOrderPage({ params }: PageProps) {
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
      "id, code, status, recipe_id, customer_id, planned_quantity, planned_start_at, planned_end_at, notes",
    )
    .eq("id", orderId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle<OrderRow>();

  if (!order) notFound();

  const editable =
    order.status === "draft" ||
    order.status === "planned" ||
    order.status === "in_progress";
  if (!editable) {
    redirect(companyModulePath(companyId, "production", order.id));
  }

  const [{ data: recipes }, { data: customers }] = await Promise.all([
    supabase
      .from("recipes")
      .select(
        "id, code, name, version, yield_quantity, yield_uom, finished_material_id, " +
          "materials:finished_material_id(code, name, fason_customer_id)",
      )
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .or(`status.eq.published,id.eq.${order.recipe_id}`)
      .order("updated_at", { ascending: false })
      .returns<RecipeOption[]>(),
    supabase
      .from("customers")
      .select("id, code, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name"),
  ]);

  const recipeOptions = (recipes ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    version: r.version,
    yield_quantity: Number(r.yield_quantity),
    yield_uom: r.yield_uom,
    finished_material_id: r.finished_material_id,
    material_code: r.materials?.code ?? "",
    material_name: r.materials?.name ?? "",
    fason_customer_id: r.materials?.fason_customer_id ?? null,
  }));

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          <Link
            href={companyModulePath(companyId, "production", order.id)}
            className="hover:underline"
          >
            ← {order.code}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Üretim Emrini Düzenle
        </h1>
        <p className="text-sm text-muted-foreground">
          {order.status === "in_progress"
            ? "Parti açıldığı için reçete kilitli; hedef miktar, tarihler, müşteri ve notlar güncellenebilir. Hedef miktar değişirse açık partinin planlı miktarı da güncellenir."
            : "Reçete, hedef miktar, tarihler, müşteri ve notlar güncellenebilir."}
        </p>
      </header>

      <ProductionOrderForm
        companyId={companyId}
        recipes={recipeOptions}
        customers={customers ?? []}
        initial={{
          id: order.id,
          recipe_id: order.recipe_id,
          customer_id: order.customer_id,
          planned_quantity: Number(order.planned_quantity),
          planned_start_at: order.planned_start_at,
          planned_end_at: order.planned_end_at,
          notes: order.notes,
          recipeLocked: order.status === "in_progress",
        }}
      />
    </div>
  );
}
