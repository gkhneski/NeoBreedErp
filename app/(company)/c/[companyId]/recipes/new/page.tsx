import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { RecipeForm } from "./recipe-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ kind?: string }>;
}

export default async function NewRecipePage({ params, searchParams }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { kind } = await searchParams;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  // A YM recipe outputs a semi material; a Mamül recipe outputs a finished one.
  const isYm = kind === "ym";
  const outputType = isYm ? "semi" : "finished";

  const { data: finishedMaterials } = await supabase
    .from("materials")
    .select("id, code, name, type")
    .eq("company_id", companyId)
    .eq("type", outputType)
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .returns<Array<{ id: string; code: string; name: string; type: string }>>();

  const returnTo = `${companyModulePath(companyId, "recipes", "new")}?kind=${
    isYm ? "ym" : "mamul"
  }`;
  const title = isYm ? "Yeni Yarı Mamül Reçetesi" : "Yeni Tam Mamül Reçetesi";

  if (!finishedMaterials || finishedMaterials.length === 0) {
    const newMaterialHref = isYm
      ? `${companyModulePath(companyId, "materials", "new")}?type=semi&returnTo=${encodeURIComponent(returnTo)}`
      : `${companyModulePath(companyId, "materials", "new")}?type=finished&returnTo=${encodeURIComponent(returnTo)}`;

    return (
      <div className="max-w-3xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </header>
        <EmptyState
          title={isYm ? "Önce yarı mamül tanımlayın" : "Önce bitmiş ürün tanımlayın"}
          description={
            isYm
              ? "YM reçetesi bir yarı mamüle bağlıdır. Önce 'Yarı Mamüller' bölümünden en az bir kayıt oluşturun."
              : "Mamül reçetesi bir bitmiş ürüne bağlıdır. Önce 'Ürünler' bölümünden en az bir kayıt oluşturun."
          }
        />
        <div>
          <Link href={newMaterialHref}>
            <Button>{isYm ? "Yarı Mamül Ekle" : "Bitmiş Ürün Ekle"}</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {isYm
            ? "Çıktı bir yarı mamüldür; kalemlerine yalnızca hammadde eklenir. Taslak olarak oluşturulur, kalemleri ekledikten sonra yayınlanır."
            : "Çıktı bir bitmiş üründür; kalemlerine yarı mamül (YM) + ambalaj eklenir. Taslak olarak oluşturulur, kalemleri ekledikten sonra yayınlanır."}
        </p>
      </header>
      <RecipeForm
        companyId={companyId}
        kind={isYm ? "ym" : "mamul"}
        finishedMaterials={finishedMaterials.map((m) => ({
          id: m.id,
          label: `${m.type === "semi" ? "[YM] " : "[Mamül] "}${m.code} — ${m.name}`,
        }))}
      />
    </div>
  );
}
