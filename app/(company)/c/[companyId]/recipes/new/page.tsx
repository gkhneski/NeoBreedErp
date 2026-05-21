import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { RecipeForm } from "./recipe-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function NewRecipePage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: finishedMaterials } = await supabase
    .from("materials")
    .select("id, code, name")
    .eq("company_id", companyId)
    .eq("type", "finished")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (!finishedMaterials || finishedMaterials.length === 0) {
    return (
      <div className="max-w-3xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Yeni Reçete</h1>
        </header>
        <EmptyState
          title="Önce bitmiş ürün tanımlayın"
          description="Reçete bir bitmiş ürüne bağlıdır. Önce malzemeler bölümünden 'Bitmiş Ürün' tipinde en az bir kayıt oluşturun."
        />
        <div>
          <Link href={companyModulePath(companyId, "materials", "new")}>
            <Button>Malzeme Ekle</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Yeni Reçete</h1>
        <p className="text-sm text-muted-foreground">
          Reçete önce taslak olarak oluşturulur. Kalemleri ekledikten sonra yayınlayabilirsiniz.
        </p>
      </header>
      <RecipeForm
        companyId={companyId}
        finishedMaterials={finishedMaterials.map((m) => ({
          id: m.id,
          label: `${m.code} — ${m.name}`,
        }))}
      />
    </div>
  );
}
