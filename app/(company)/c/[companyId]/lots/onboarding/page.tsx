import Link from "next/link";

import { requireCompanyRole } from "@/lib/auth";
import type { LocationOption } from "@/lib/locations";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  MASTER_DATA_WRITE_ROLES,
  STOCK_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

import { OnboardingForm } from "./onboarding-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type MaterialRow = {
  id: string;
  code: string;
  name: string;
  type: "raw" | "finished";
  base_uom: string;
  barcode: string | null;
};

export default async function LotOnboardingPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireCompanyRole(
    routeCompanyId,
    STOCK_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  // Depocu (operator) yalnizca bitmis urun girer; hammadde fabrika konusu.
  let materialsQuery = supabase
    .from("materials")
    .select("id, code, name, type, base_uom, barcode")
    .eq("company_id", companyId)
    .is("deleted_at", null);
  if (role === "operator") {
    materialsQuery = materialsQuery.eq("type", "finished");
  }

  const [{ data: materials }, { data: locations }] = await Promise.all([
    materialsQuery
      .order("type", { ascending: false })
      .order("code")
      .returns<MaterialRow[]>(),
    supabase
      .from("locations")
      .select("id, code, name, kind, parent_id, is_default")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("is_default", { ascending: false })
      .order("code")
      .returns<LocationOption[]>(),
  ]);

  const locationRows = locations ?? [];
  const defaultLocationId =
    locationRows.find((l) => l.is_default)?.id ?? locationRows[0]?.id ?? null;

  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          <Link
            href={companyModulePath(companyId, "lots")}
            className="hover:underline"
          >
            ← Lotlar
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Mevcut Stok Girişi (Eski Ürünler)
        </h1>
        <p className="text-sm text-muted-foreground">
          Depoda halihazırda bulunan ürünleri hızlıca kaydedin. Kutunun
          barkodunu el okuyucu veya tabletin kamerasıyla okutun; ürün otomatik
          seçilir (tanımsızsa oracıkta ekleyebilirsiniz). Ardından lot numarası,
          son kullanma tarihi, adet ve rafı girin. Kayıt doğrudan
          &quot;Serbest&quot; durumda açılır; QR etiketini yazdırıp ürünün
          üzerine yapıştırın. Form art arda giriş için seçimleri korur.
        </p>
      </header>

      <OnboardingForm
        companyId={companyId}
        materials={materials ?? []}
        locations={locationRows}
        defaultLocationId={defaultLocationId}
        canCreateProduct={canWriteCompanyData(role, MASTER_DATA_WRITE_ROLES)}
      />
    </div>
  );
}
