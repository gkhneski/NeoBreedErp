import { notFound } from "next/navigation";

import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES } from "@/types/roles";

import { CustomerForm } from "../../new/customer-form";

interface PageProps {
  params: Promise<{ companyId: string; customerId: string }>;
}

export default async function EditCustomerPage({ params }: PageProps) {
  const { companyId: routeCompanyId, customerId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, code, name, tax_number, email, phone, address, country, notes")
    .eq("company_id", companyId)
    .eq("id", customerId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!customer) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Müşteri Düzenle</h1>
        <p className="font-mono text-sm text-muted-foreground">{customer.code}</p>
      </header>
      <CustomerForm companyId={companyId} initial={customer} />
    </div>
  );
}
