import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireModuleAccess } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  MASTER_DATA_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

interface PageProps {
  params: Promise<{ companyId: string }>;
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

export default async function RecipesListPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireModuleAccess(routeCompanyId, "recipes");
  const supabase = await createServerSupabaseClient();

  const { data: recipes } = await supabase
    .from("recipes")
    .select(
      "id, code, name, version, status, mode, yield_quantity, yield_uom, finished_material_id, updated_at",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  const materialIds = Array.from(
    new Set((recipes ?? []).map((r) => r.finished_material_id)),
  );
  const materialMap = new Map<string, string>();
  if (materialIds.length > 0) {
    const { data: materials } = await supabase
      .from("materials")
      .select("id, name")
      .in("id", materialIds);
    for (const m of materials ?? []) {
      materialMap.set(m.id, m.name);
    }
  }

  const newHref = companyModulePath(companyId, "recipes", "new");

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Reçeteler</h1>
          <p className="text-sm text-muted-foreground">
            Bitmiş ürünlerinizin formülasyonları. Yayınlanmış reçete üretim emirlerinde
            kullanılır.
          </p>
        </div>
        {canWriteCompanyData(role, MASTER_DATA_WRITE_ROLES) ? (
          <Link href={newHref}>
            <Button>Yeni Reçete</Button>
          </Link>
        ) : null}
      </header>

      {recipes && recipes.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Kod</th>
                <th className="px-3 py-2 text-left font-medium">Ad</th>
                <th className="px-3 py-2 text-left font-medium">Bitmiş Ürün</th>
                <th className="px-3 py-2 text-right font-medium">Versiyon</th>
                <th className="px-3 py-2 text-left font-medium">Mod</th>
                <th className="px-3 py-2 text-right font-medium">Verim</th>
                <th className="px-3 py-2 text-left font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {recipes.map((r) => (
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
                    {materialMap.get(r.finished_material_id) ?? "—"}
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
          title="Henüz reçete yok"
          description="Reçete oluşturmak için önce en az bir 'bitmiş ürün' tipinde malzeme tanımlamalısınız."
        />
      )}
    </div>
  );
}
