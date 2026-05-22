import { notFound } from "next/navigation";

import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES } from "@/types/roles";

import { SupplierForm } from "../../new/supplier-form";

interface PageProps {
  params: Promise<{ companyId: string; supplierId: string }>;
}

export default async function EditSupplierPage({ params }: PageProps) {
  const { companyId: routeCompanyId, supplierId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id, code, name, tax_number, email, phone, address, country, notes")
    .eq("company_id", companyId)
    .eq("id", supplierId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!supplier) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tedarikçi Düzenle</h1>
        <p className="font-mono text-sm text-muted-foreground">{supplier.code}</p>
      </header>
      <SupplierForm companyId={companyId} initial={supplier} />
    </div>
  );
}
