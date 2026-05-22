import { notFound } from "next/navigation";

import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES } from "@/types/roles";

import { MaterialForm } from "../../new/material-form";

interface PageProps {
  params: Promise<{ companyId: string; materialId: string }>;
}

type MaterialInitial = {
  id: string;
  code: string;
  name: string;
  type: "raw" | "finished";
  base_uom: string;
  density: number | null;
  default_supplier_id: string | null;
  allergen_flags: unknown;
  storage_conditions: string | null;
  regulatory_notes: string | null;
  notes: string | null;
};

export default async function EditMaterialPage({ params }: PageProps) {
  const { companyId: routeCompanyId, materialId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const [{ data: material }, { data: suppliers }] = await Promise.all([
    supabase
      .from("materials")
      .select(
        "id, code, name, type, base_uom, density, default_supplier_id, allergen_flags, storage_conditions, regulatory_notes, notes",
      )
      .eq("company_id", companyId)
      .eq("id", materialId)
      .is("deleted_at", null)
      .maybeSingle<MaterialInitial>(),
    supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("code", { ascending: true }),
  ]);

  if (!material) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Malzeme Düzenle</h1>
        <p className="font-mono text-sm text-muted-foreground">{material.code}</p>
      </header>
      <MaterialForm
        companyId={companyId}
        suppliers={suppliers ?? []}
        defaultType={material.type}
        initial={material}
      />
    </div>
  );
}
