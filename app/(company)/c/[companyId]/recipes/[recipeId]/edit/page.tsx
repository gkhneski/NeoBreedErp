import { notFound } from "next/navigation";

import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES } from "@/types/roles";

import { RecipeForm } from "../../new/recipe-form";

interface PageProps {
  params: Promise<{ companyId: string; recipeId: string }>;
}

type RecipeInitial = {
  id: string;
  code: string;
  finished_material_id: string;
  name: string;
  mode: "quantity" | "percentage";
  yield_quantity: number;
  yield_uom: string;
  notes: string | null;
  status: string;
};

export default async function EditRecipePage({ params }: PageProps) {
  const { companyId: routeCompanyId, recipeId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const [{ data: recipe }, { data: finishedMaterials }] = await Promise.all([
    supabase
      .from("recipes")
      .select(
        "id, code, finished_material_id, name, mode, yield_quantity, yield_uom, notes, status",
      )
      .eq("company_id", companyId)
      .eq("id", recipeId)
      .is("deleted_at", null)
      .maybeSingle<RecipeInitial>(),
    supabase
      .from("materials")
      .select("id, code, name")
      .eq("company_id", companyId)
      .eq("type", "finished")
      .is("deleted_at", null)
      .order("code", { ascending: true }),
  ]);

  if (!recipe || recipe.status !== "draft") notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Reçete Düzenle</h1>
        <p className="font-mono text-sm text-muted-foreground">{recipe.code}</p>
      </header>
      <RecipeForm
        companyId={companyId}
        initial={recipe}
        finishedMaterials={(finishedMaterials ?? []).map((m) => ({
          id: m.id,
          label: `${m.code} - ${m.name}`,
        }))}
      />
    </div>
  );
}
