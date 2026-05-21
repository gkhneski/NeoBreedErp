import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PRODUCTION_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { ProductionOrderForm } from "./production-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type RecipeOption = {
  id: string;
  code: string;
  name: string;
  version: number;
  yield_quantity: number;
  yield_uom: string;
  finished_material_id: string;
  materials: { code: string; name: string } | null;
};

export default async function NewProductionOrderPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    PRODUCTION_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: recipes } = await supabase
    .from("recipes")
    .select(
      "id, code, name, version, yield_quantity, yield_uom, finished_material_id, " +
        "materials:finished_material_id(code, name)",
    )
    .eq("company_id", companyId)
    .eq("status", "published")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .returns<RecipeOption[]>();

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
  }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          <Link
            href={companyModulePath(companyId, "production")}
            className="hover:underline"
          >
            ← Üretim Emirleri
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Yeni Üretim Emri
        </h1>
        <p className="text-sm text-muted-foreground">
          Yayında bir reçete seçip hedef üretim miktarını giriniz. Reçetenin
          bitmiş ürünü ve birimi otomatik dondurulur; reçete daha sonra
          versiyonlansa bile bu emir kendi reçete sürümüne bağlı kalır.
        </p>
      </header>

      {recipeOptions.length > 0 ? (
        <ProductionOrderForm companyId={companyId} recipes={recipeOptions} />
      ) : (
        <EmptyState
          title="Yayında reçete yok"
          description="Üretim emri açmadan önce en az bir reçeteyi 'yayında' durumuna almalısınız."
          action={
            <Link href={companyModulePath(companyId, "recipes")}>
              <Button variant="outline">Reçetelere git</Button>
            </Link>
          }
        />
      )}
    </div>
  );
}
