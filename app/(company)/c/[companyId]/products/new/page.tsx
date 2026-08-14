import Link from "next/link";

import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { ProductRecipeForm } from "./product-recipe-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function NewProductPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: matRows } = await supabase
    .from("materials")
    .select(
      "id, code, name, type, base_uom, material_lots(quantity_on_hand, status, deleted_at)",
    )
    .eq("company_id", companyId)
    .in("type", ["semi", "raw"])
    .is("deleted_at", null)
    .order("code", { ascending: true });

  // Phase 17: a Tam Mamül recipe holds YM + packaging only.
  const recipeMaterials = (matRows ?? []).filter(
    (m) => m.type === "semi" || /^(AMB|PKG)-/i.test(m.code),
  );

  const { data: trendyolProducts } = await supabase
    .from("marketplace_remote_products")
    .select("barcode, title, image_url")
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .order("title", { ascending: true });

  const { data: customers } = await supabase
    .from("customers")
    .select("id, code, name")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("name");

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          <Link
            href={companyModulePath(companyId, "products")}
            className="hover:underline"
          >
            Ürünler
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Yeni Ürün</h1>
        <p className="text-sm text-muted-foreground">
          Ürün kartını açın; reçete kalemlerini (YM + ambalaj) şimdi seçebilir
          veya ürünü oluşturduktan sonra Reçeteler bölümünden ekleyebilirsiniz.
        </p>
      </header>
      <ProductRecipeForm
        companyId={companyId}
        recipeMaterials={recipeMaterials}
        trendyolProducts={trendyolProducts ?? []}
        customers={customers ?? []}
      />
    </div>
  );
}
