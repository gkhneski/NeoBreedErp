import Link from "next/link";

import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STOCK_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { ScanClient } from "./scan-client";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function WarehouseScanPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    STOCK_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: locations } = await supabase
    .from("locations")
    .select("id, code, name, is_default")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("code");

  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          <Link
            href={companyModulePath(companyId, "warehouse")}
            className="hover:underline"
          >
            ← Depo Hareketleri
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Barkod Tara</h1>
        <p className="text-sm text-muted-foreground">
          Lot etiketindeki QR kodu telefon kamerasıyla okutun; lot bilgisi gelir
          ve tek dokunuşla hedef depoya alınır. Kamera yoksa lot numarasını elle
          girin.
        </p>
      </header>

      <ScanClient companyId={companyId} locations={locations ?? []} />
    </div>
  );
}
