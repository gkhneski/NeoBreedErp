import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireModuleAccess } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  MASTER_DATA_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

interface PageProps {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ tab?: string }>;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Taslak",
  published: "Yayında",
  archived: "Arşivli",
};

const MODE_LABEL: Record<string, string> = {
  quantity: "Miktar",
  percentage: "Yüzde",
};

type RecipeRow = {
  id: string;
  code: string;
  name: string;
  version: number;
  status: string;
  mode: string;
  yield_quantity: number;
  yield_uom: string;
  finished_material_id: string;
  updated_at: string;
};

export default async function RecipesListPage({ params, searchParams }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { tab } = await searchParams;
  const { companyId, role } = await requireModuleAccess(routeCompanyId, "recipes");
  const supabase = await createServerSupabaseClient();

  const activeTab = tab === "mamul" ? "mamul" : "ym";

  const { data: recipes } = await supabase
    .from("recipes")
    .select(
      "id, code, name, version, status, mode, yield_quantity, yield_uom, finished_material_id, updated_at",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .returns<RecipeRow[]>();

  const materialIds = Array.from(
    new Set((recipes ?? []).map((r) => r.finished_material_id)),
  );
  const materialMap = new Map<string, { name: string; type: string }>();
  if (materialIds.length > 0) {
    const { data: materials } = await supabase
      .from("materials")
      .select("id, name, type")
      .in("id", materialIds);
    for (const m of materials ?? []) {
      materialMap.set(m.id, { name: m.name, type: m.type });
    }
  }

  const ymRecipes = (recipes ?? []).filter(
    (r) => materialMap.get(r.finished_material_id)?.type === "semi",
  );
  const mamulRecipes = (recipes ?? []).filter(
    (r) => materialMap.get(r.finished_material_id)?.type === "finished",
  );

  const rows = activeTab === "ym" ? ymRecipes : mamulRecipes;
  const canWrite = canWriteCompanyData(role, MASTER_DATA_WRITE_ROLES);
  const newHref = `${companyModulePath(companyId, "recipes", "new")}?kind=${
    activeTab === "ym" ? "ym" : "mamul"
  }`;
  const outputLabel = activeTab === "ym" ? "Yarı Mamül" : "Bitmiş Ürün";

  const tabs = [
    {
      key: "ym",
      label: `Yarı Mamül Reçeteleri (${ymRecipes.length})`,
      href: `${companyModulePath(companyId, "recipes")}?tab=ym`,
    },
    {
      key: "mamul",
      label: `Tam Mamül Reçeteleri (${mamulRecipes.length})`,
      href: `${companyModulePath(companyId, "recipes")}?tab=mamul`,
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Reçeteler</h1>
          <p className="text-sm text-muted-foreground">
            {activeTab === "ym"
              ? "Yarı mamül (YM) reçeteleri: yalnızca hammaddeden üretilir."
              : "Tam mamül reçeteleri: bir yarı mamül (YM) + ambalajdan oluşur."}
          </p>
        </div>
        {canWrite ? (
          <Link href={newHref}>
            <Button>
              {activeTab === "ym" ? "Yeni YM Reçetesi" : "Yeni Mamül Reçetesi"}
            </Button>
          </Link>
        ) : null}
      </header>

      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => {
          const active = t.key === activeTab;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={cn(
                "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Kod</th>
                <th className="px-3 py-2 text-left font-medium">Ad</th>
                <th className="px-3 py-2 text-left font-medium">{outputLabel}</th>
                <th className="px-3 py-2 text-right font-medium">Versiyon</th>
                <th className="px-3 py-2 text-left font-medium">Mod</th>
                <th className="px-3 py-2 text-right font-medium">Verim</th>
                <th className="px-3 py-2 text-left font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link
                      href={companyModulePath(companyId, "recipes", r.id)}
                      className="hover:underline"
                    >
                      {r.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {materialMap.get(r.finished_material_id)?.name ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">v{r.version}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {MODE_LABEL[r.mode] ?? r.mode}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Number(r.yield_quantity)} {r.yield_uom}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={
                        r.status === "published"
                          ? "default"
                          : r.status === "archived"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title={
            activeTab === "ym"
              ? "Henüz yarı mamül reçetesi yok"
              : "Henüz tam mamül reçetesi yok"
          }
          description={
            activeTab === "ym"
              ? "Bir yarı mamül seçip yalnızca hammaddelerden reçetesini oluşturun."
              : "Bir bitmiş ürün seçip yarı mamül (YM) + ambalajdan reçetesini oluşturun."
          }
          action={
            canWrite ? (
              <Link href={newHref}>
                <Button>
                  {activeTab === "ym" ? "Yeni YM Reçetesi" : "Yeni Mamül Reçetesi"}
                </Button>
              </Link>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
