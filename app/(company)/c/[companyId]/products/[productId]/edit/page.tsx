import { notFound } from "next/navigation";

import { requireCompanyRole } from "@/lib/auth";
import {
  SIGNED_URL_TTL_SECONDS,
  TENANT_FILES_BUCKET,
} from "@/lib/storage/attachments";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { MaterialForm } from "../../../materials/new/material-form";
import { ProductThumbnailForm } from "./product-thumbnail-form";

interface PageProps {
  params: Promise<{ companyId: string; productId: string }>;
}

type ProductInitial = {
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

export default async function EditProductPage({ params }: PageProps) {
  const { companyId: routeCompanyId, productId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const [{ data: product }, { data: suppliers }] = await Promise.all([
    supabase
      .from("materials")
      .select(
        "id, code, name, type, base_uom, density, default_supplier_id, allergen_flags, storage_conditions, regulatory_notes, notes",
      )
      .eq("company_id", companyId)
      .eq("id", productId)
      .eq("type", "finished")
      .is("deleted_at", null)
      .maybeSingle<ProductInitial>(),
    supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("code", { ascending: true }),
  ]);

  if (!product) notFound();

  const thumbnailPath = `${companyId}/products/${product.id}/thumbnail`;
  const { data: signedThumbnail } = await supabase.storage
    .from(TENANT_FILES_BUCKET)
    .createSignedUrl(thumbnailPath, SIGNED_URL_TTL_SECONDS);

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Ürün Düzenle</h1>
        <p className="font-mono text-sm text-muted-foreground">{product.code}</p>
      </header>
      <MaterialForm
        companyId={companyId}
        suppliers={suppliers ?? []}
        defaultType="finished"
        returnTo={companyModulePath(companyId, "products")}
        initial={product}
      />
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Ürün Görseli</h2>
        <ProductThumbnailForm
          companyId={companyId}
          productId={product.id}
          thumbnailUrl={signedThumbnail?.signedUrl ?? null}
        />
      </section>
    </div>
  );
}
