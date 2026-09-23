import "server-only";

import type { createServerSupabaseClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type RecipeEditability =
  | { editable: true; published: boolean }
  | { editable: false; reason: string };

// Draft recipes are always editable. A published recipe may be corrected in
// place until a production batch has actually consumed from it; after that
// the version is frozen for traceability and changes go through a new version.
export async function getRecipeEditability(
  supabase: Supabase,
  companyId: string,
  recipeId: string,
  status: string,
): Promise<RecipeEditability> {
  if (status === "draft") return { editable: true, published: false };
  if (status !== "published") {
    return { editable: false, reason: "Arşivli reçete düzenlenemez." };
  }

  const { count } = await supabase
    .from("production_batches")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("recipe_id", recipeId)
    .in("status", ["completed", "closed"]);

  if ((count ?? 0) > 0) {
    return {
      editable: false,
      reason:
        "Bu reçete sürümüyle tamamlanmış üretim partisi var; izlenebilirlik için yerinde düzenlenemez. Yeni Versiyon oluşturup düzenleyin.",
    };
  }

  return { editable: true, published: true };
}
