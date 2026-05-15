import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

import {
  createNewRecipeVersion,
  publishRecipe,
  removeRecipeItem,
} from "../actions";
import { RecipeItemAddForm } from "./item-add-form";

interface PageProps {
  params: Promise<{ companyId: string; recipeId: string }>;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Taslak",
  published: "Yayında",
  archived: "Arşivli",
};

const MODE_LABEL: Record<string, string> = {
  quantity: "Miktar bazlı",
  percentage: "Yüzde bazlı",
};

export default async function RecipeDetailPage({ params }: PageProps) {
  const { companyId: routeCompanyId, recipeId } = await params;
  const { companyId } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const { data: recipe } = await supabase
    .from("recipes")
    .select(
      "id, company_id, finished_material_id, code, name, version, status, mode, yield_quantity, yield_uom, notes, created_at, updated_at",
    )
    .eq("id", recipeId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!recipe) notFound();

  const [{ data: finishedMaterial }, { data: items }, { data: allMaterials }] =
    await Promise.all([
      supabase
        .from("materials")
        .select("id, code, name")
        .eq("id", recipe.finished_material_id)
        .maybeSingle(),
      supabase
        .from("recipe_items")
        .select("id, material_id, position, quantity, uom, percentage, active, notes")
        .eq("recipe_id", recipe.id)
        .order("position", { ascending: true }),
      supabase
        .from("materials")
        .select("id, code, name, type")
        .eq("company_id", companyId)
        .eq("type", "raw")
        .is("deleted_at", null)
        .order("name", { ascending: true }),
    ]);

  const materialMap = new Map<string, { code: string; name: string }>();
  for (const m of allMaterials ?? []) {
    materialMap.set(m.id, { code: m.code, name: m.name });
  }

  const isDraft = recipe.status === "draft";
  const isPublished = recipe.status === "published";

  const activePercentageTotal =
    recipe.mode === "percentage"
      ? (items ?? [])
          .filter((i) => i.active)
          .reduce((sum, i) => sum + Number(i.percentage ?? 0), 0)
      : null;

  const backHref = companyModulePath(companyId, "recipes");
  const publishAction = publishRecipe.bind(null, companyId, recipe.id);
  const newVersionAction = createNewRecipeVersion.bind(null, companyId, recipe.id);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={backHref}
            className="text-xs text-muted-foreground hover:underline"
          >
            ← Reçeteler
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className="font-mono text-base text-muted-foreground">
              {recipe.code}
            </span>{" "}
            {recipe.name}{" "}
            <span className="text-base text-muted-foreground">v{recipe.version}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Bitmiş Ürün:{" "}
            <span className="text-foreground">
              {finishedMaterial?.code} — {finishedMaterial?.name}
            </span>
          </p>
        </div>
        <Badge
          variant={
            recipe.status === "published"
              ? "default"
              : recipe.status === "archived"
                ? "secondary"
                : "outline"
          }
        >
          {STATUS_LABEL[recipe.status] ?? recipe.status}
        </Badge>
      </div>

      <section className="grid gap-3 rounded-md border border-border bg-card p-4 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Mod</p>
          <p className="font-medium">{MODE_LABEL[recipe.mode] ?? recipe.mode}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Verim</p>
          <p className="font-medium tabular-nums">
            {Number(recipe.yield_quantity)} {recipe.yield_uom}
          </p>
        </div>
        {activePercentageTotal !== null ? (
          <div>
            <p className="text-xs text-muted-foreground">Aktif Kalem Yüzdesi</p>
            <p
              className={
                Math.abs(activePercentageTotal - 100) < 0.0001
                  ? "font-medium tabular-nums text-foreground"
                  : "font-medium tabular-nums text-destructive"
              }
            >
              {activePercentageTotal.toFixed(4)} / 100
            </p>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Kalemler
          </h2>
          {isDraft ? (
            <form action={publishAction}>
              <Button type="submit" size="sm">
                Yayınla
              </Button>
            </form>
          ) : null}
          {isPublished ? (
            <form action={newVersionAction}>
              <Button type="submit" size="sm" variant="outline">
                Yeni Versiyon Oluştur
              </Button>
            </form>
          ) : null}
        </div>

        {items && items.length > 0 ? (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Malzeme</th>
                  <th className="px-3 py-2 text-right font-medium">Miktar</th>
                  <th className="px-3 py-2 text-left font-medium">Birim</th>
                  <th className="px-3 py-2 text-right font-medium">%</th>
                  <th className="px-3 py-2 text-left font-medium">Aktif</th>
                  {isDraft ? <th className="px-3 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const m = materialMap.get(item.material_id);
                  const removeAction = removeRecipeItem.bind(
                    null,
                    companyId,
                    recipe.id,
                    item.id,
                  );
                  return (
                    <tr key={item.id} className="border-t border-border">
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {item.position}
                      </td>
                      <td className="px-3 py-2">
                        {m ? (
                          <>
                            <span className="font-mono text-xs text-muted-foreground">
                              {m.code}
                            </span>{" "}
                            {m.name}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(item.quantity)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{item.uom}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {item.percentage !== null
                          ? Number(item.percentage).toFixed(4)
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {item.active ? "Evet" : "Hayır"}
                      </td>
                      {isDraft ? (
                        <td className="px-3 py-2 text-right">
                          <form action={removeAction}>
                            <Button
                              type="submit"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                            >
                              Sil
                            </Button>
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
            Henüz kalem yok.{" "}
            {isDraft
              ? "Aşağıdaki formdan ekleyin."
              : "Yeni versiyon oluşturup düzenleyebilirsiniz."}
          </p>
        )}
      </section>

      {isDraft ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Kalem Ekle
          </h2>
          <RecipeItemAddForm
            companyId={companyId}
            recipeId={recipe.id}
            recipeMode={recipe.mode}
            rawMaterials={(allMaterials ?? []).map((m) => ({
              id: m.id,
              label: `${m.code} — ${m.name}`,
            }))}
          />
        </section>
      ) : null}

      {recipe.notes ? (
        <section className="space-y-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Notlar
          </h2>
          <p className="whitespace-pre-wrap rounded-md border border-border bg-card p-3 text-sm">
            {recipe.notes}
          </p>
        </section>
      ) : null}
    </div>
  );
}
