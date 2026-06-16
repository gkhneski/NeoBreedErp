import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CatalogAvailability } from "@/types/database";
import { ORDER_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { RepOrderForm, type RepCatalogProduct } from "./rep-order-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type CatalogRow = {
  material_id: string;
  sale_price: number | null;
  low_stock_threshold: number;
  materials: { name: string; base_uom: string } | null;
};

export default async function RepOrderPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyRole(routeCompanyId, ORDER_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  const [{ data: customers }, { data: catalog }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, code, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("product_catalog")
      .select(
        "material_id, sale_price, low_stock_threshold, " +
          "materials:material_id(name, base_uom)",
      )
      .eq("company_id", companyId)
      .eq("is_listed", true)
      .is("deleted_at", null)
      .returns<CatalogRow[]>(),
  ]);

  const materialIds = (catalog ?? []).map((c) => c.material_id);
  const onHand = new Map<string, number>();
  if (materialIds.length > 0) {
    const { data: lots } = await supabase
      .from("material_lots")
      .select("material_id, quantity_on_hand")
      .eq("company_id", companyId)
      .in("material_id", materialIds)
      .eq("status", "released")
      .is("owner_customer_id", null)
      .is("deleted_at", null)
      .gt("quantity_on_hand", 0);
    for (const l of lots ?? []) {
      onHand.set(
        l.material_id,
        (onHand.get(l.material_id) ?? 0) + Number(l.quantity_on_hand),
      );
    }
  }

  const products: RepCatalogProduct[] = (catalog ?? [])
    .map((c) => {
      const stock = onHand.get(c.material_id) ?? 0;
      const availability: CatalogAvailability =
        stock <= 0 ? "out" : stock < c.low_stock_threshold ? "low" : "in";
      return {
        materialId: c.material_id,
        name: c.materials?.name ?? "Ürün",
        baseUom: c.materials?.base_uom ?? "unit",
        salePrice: c.sale_price === null ? null : Number(c.sale_price),
        availability,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));

  const customerOptions = (customers ?? []).map((c) => ({
    id: c.id,
    label: `${c.code} · ${c.name}`,
  }));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Yeni Sipariş (Eczane Adına)
          </h1>
          <p className="text-sm text-muted-foreground">
            Bir eczane/depo seçip ürünleri ekleyin. Sipariş depoya iletilir.
          </p>
        </div>
        <Link href={companyModulePath(companyId, "sales-orders")}>
          <Button variant="outline">Siparişlere dön</Button>
        </Link>
      </header>

      {customerOptions.length === 0 || products.length === 0 ? (
        <EmptyState
          title="Sipariş için eksik kurulum"
          description="Önce en az bir müşteri ekleyin ve Portal Kataloğu'ndan ürün listeleyin."
        />
      ) : (
        <RepOrderForm
          companyId={companyId}
          customers={customerOptions}
          products={products}
        />
      )}
    </div>
  );
}
