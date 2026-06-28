import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ORDER_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { ManualOrderForm, type ManualProduct } from "./manual-order-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function ManualOrderPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyRole(routeCompanyId, ORDER_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  const [{ data: customers }, { data: materials }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, code, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("materials")
      .select("id, code, name, base_uom")
      .eq("company_id", companyId)
      .eq("type", "finished")
      .is("deleted_at", null)
      .order("name"),
  ]);

  const products: ManualProduct[] = (materials ?? []).map((m) => ({
    materialId: m.id,
    label: `${m.code} · ${m.name}`,
    baseUom: m.base_uom,
  }));
  const customerOptions = (customers ?? []).map((c) => ({
    id: c.id,
    label: `${c.code} · ${c.name}`,
  }));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Yeni Müşteri Siparişi (Manuel)
          </h1>
          <p className="text-sm text-muted-foreground">
            Fason/toptan sipariş girin. Bu açık talep MRP&apos;de patlatılır.
          </p>
        </div>
        <Link href={companyModulePath(companyId, "sales-orders")}>
          <Button variant="outline">Siparişlere dön</Button>
        </Link>
      </header>

      {customerOptions.length === 0 || products.length === 0 ? (
        <EmptyState
          title="Sipariş için eksik kurulum"
          description="Önce en az bir müşteri ve en az bir bitmiş ürün tanımlayın."
        />
      ) : (
        <ManualOrderForm
          companyId={companyId}
          customers={customerOptions}
          products={products}
        />
      )}
    </div>
  );
}
