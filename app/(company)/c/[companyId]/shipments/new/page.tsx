import Link from "next/link";

import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SHIPMENT_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { ShipmentForm } from "./shipment-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function NewShipmentPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    SHIPMENT_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: customers } = await supabase
    .from("customers")
    .select("id, code, name")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("name");

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          <Link
            href={companyModulePath(companyId, "shipments")}
            className="hover:underline"
          >
            ← Siparişler
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Yeni Sipariş</h1>
        <p className="text-sm text-muted-foreground">
          Siparişi açtıktan sonra detay sayfasından sevk edilecek lotları
          ekleyip &quot;Gönderildi&quot; ile tamamlarsınız.
        </p>
      </header>
      <ShipmentForm companyId={companyId} customers={customers ?? []} />
    </div>
  );
}
