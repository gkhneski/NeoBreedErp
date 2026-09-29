import Link from "next/link";

import { requireCompanyRole } from "@/lib/auth";
import type { LocationOption } from "@/lib/locations";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STOCK_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { ScanClient } from "./scan-client";

interface PageProps {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ lot?: string }>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function WarehouseScanPage({
  params,
  searchParams,
}: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { lot: requestedLot } = await searchParams;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    STOCK_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: locations } = await supabase
    .from("locations")
    .select("id, code, name, kind, parent_id, is_default")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("code")
    .returns<LocationOption[]>();

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
          Lot etiketindeki veya parti kartındaki QR kodu okutun; lot bilgisi
          gelir. Başka depodan gelen ürünü sayıp miktarı girin, ardından hedef
          depoyu seçin: ürün saydığınız miktarla stoğunuza girer. Lotu okutup
          ardından raf etiketini okutarak da yerleştirme yapabilirsiniz. Raf
          etiketi okutursanız raftaki ürünler listelenir. Kamera yoksa lot
          numarasını veya raf kodunu elle girin.
        </p>
      </header>

      <ScanClient
        companyId={companyId}
        locations={locations ?? []}
        initialCode={
          requestedLot && UUID_RE.test(requestedLot) ? requestedLot : undefined
        }
      />
    </div>
  );
}
