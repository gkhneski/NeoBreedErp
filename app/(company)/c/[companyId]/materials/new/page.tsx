import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES } from "@/types/roles";

import { MaterialForm } from "./material-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function NewMaterialPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, code, name")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("code", { ascending: true });

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Yeni Malzeme</h1>
        <p className="text-sm text-muted-foreground">
          Kod firma içinde benzersiz olmalı. Tedarikçi seçimi opsiyonel; lot ve
          stok hareketleri sonraki adımda gelecek.
        </p>
      </header>
      <MaterialForm companyId={companyId} suppliers={suppliers ?? []} />
    </div>
  );
}
