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

import { ALLERGEN_LABELS, type AllergenCode } from "./allergens";
import { MaterialsSearchInput } from "./search-input";

interface PageProps {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ q?: string }>;
}

const TYPE_LABEL: Record<string, string> = {
  raw: "Hammadde",
  finished: "Bitmiş Ürün",
};

type MaterialRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  base_uom: string;
  density: number | null;
  allergen_flags: unknown;
  storage_conditions: string | null;
  suppliers: { code: string; name: string } | null;
};

function asAllergenList(value: unknown): AllergenCode[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is AllergenCode => typeof v === "string" && v in ALLERGEN_LABELS);
}

export default async function MaterialsListPage({ params, searchParams }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { q } = await searchParams;
  const { companyId, role } = await requireModuleAccess(routeCompanyId, "materials");
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("materials")
    .select(
      "id, code, name, type, base_uom, density, allergen_flags, storage_conditions, suppliers:default_supplier_id(code, name)",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("code", { ascending: true });

  if (q?.trim()) {
    query = query.or(`code.ilike.%${q.trim()}%,name.ilike.%${q.trim()}%`);
  }

  const { data: materials } = await query.returns<MaterialRow[]>();

  const newHref = companyModulePath(companyId, "materials", "new");
  const rows = materials ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Malzemeler</h1>
            <p className="text-sm text-muted-foreground">
              Hammaddeler ve bitmiş ürünler.
            </p>
          </div>
          {canWriteCompanyData(role, MASTER_DATA_WRITE_ROLES) ? (
            <Link href={newHref}>
              <Button>Yeni Malzeme</Button>
            </Link>
          ) : null}
        </div>
        <MaterialsSearchInput />
      </header>

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Kod</th>
                <th className="px-3 py-2 text-left font-medium">Ad</th>
                <th className="px-3 py-2 text-left font-medium">Tip</th>
                <th className="px-3 py-2 text-left font-medium">Birim</th>
                <th className="px-3 py-2 text-left font-medium">Tedarikçi</th>
                <th className="px-3 py-2 text-left font-medium">Alerjenler</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const allergens = asAllergenList(m.allergen_flags);
                const detailHref = companyModulePath(companyId, "materials", m.id);
                return (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link href={detailHref} className="hover:underline">
                        {m.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={detailHref} className="hover:underline">
                        {m.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {TYPE_LABEL[m.type] ?? m.type}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{m.base_uom}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {m.suppliers ? (
                        <span>
                          <span className="font-mono text-xs">
                            {m.suppliers.code}
                          </span>
                          <span className="ml-1">— {m.suppliers.name}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {allergens.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {allergens.map((code) => (
                            <Badge key={code} variant="warning">
                              {ALLERGEN_LABELS[code]}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : q?.trim() ? (
        <EmptyState
          title="Sonuç bulunamadı"
          description={`"${q.trim()}" ile eşleşen malzeme yok.`}
        />
      ) : (
        <EmptyState
          title="Henüz malzeme yok"
          description="İlk hammadde veya bitmiş ürününüzü ekleyerek başlayın. Reçeteler bu malzemeleri referans alır."
        />
      )}
    </div>
  );
}
