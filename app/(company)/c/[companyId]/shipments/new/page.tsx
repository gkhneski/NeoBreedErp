import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SHIPMENT_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { ShipmentForm, type RecipientOption } from "./shipment-form";

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

  const [{ data: customers }, { data: channels }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, code, name, kind, contact_name, phone, city, district, address")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name")
      .returns<RecipientOption[]>(),
    supabase
      .from("shipment_channels")
      .select("id, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name"),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <Link
          href={companyModulePath(companyId, "shipments")}
          className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Siparişler
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Yeni Sipariş</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Kanalı ve alıcıyı seçin. Listede yoksa buradan yeni ekleyebilirsiniz;
          sevk edilecek lotları siparişi açtıktan sonra detay sayfasında
          eklersiniz.
        </p>
      </header>
      <ShipmentForm
        companyId={companyId}
        customers={customers ?? []}
        customChannels={channels ?? []}
      />
    </div>
  );
}
