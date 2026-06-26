import Link from "next/link";

import { requireCompanyRole } from "@/lib/auth";
import type { LocationOption } from "@/lib/locations";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
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
  type: "raw" | "semi" | "finished";
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

  // Bu ekran yalnizca BITMIS URUN stok girisi icindir (depo/satis).
  // Hammadde mal kabulu ayri akistir (Lotlar -> Yeni Lot: tedarikci/maliyet).
  const [{ data: materials }, { data: locations }] = await Promise.all([
    supabase
      .from("materials")
      .select("id, code, name, type, base_uom, barcode")
      .eq("company_id", companyId)
      .eq("type", "finished")
      .is("deleted_at", null)
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

  const { data: trendyolProducts } = await supabase
    .from("marketplace_remote_products")
    .select("barcode, title, image_url")
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .order("title", { ascending: true });

  const locationRows = locations ?? [];
  // Bu ekran LTD deposu içindir: varsayılan konum LTD deposu olsun.
  const ltdDepot = locationRows.find((l) => /ltd/i.test(l.name));
  const defaultLocationId =
    ltdDepot?.id ??
    locationRows.find((l) => l.is_default)?.id ??
    locationRows[0]?.id ??
    null;

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
          Bitmiş Ürün Stok Girişi
        </h1>
        <p className="text-sm text-muted-foreground">
          Depodaki <strong>bitmiş ürünleri</strong> hızlıca kaydedin (hammadde
          değil — o, Lotlar → Yeni Lot&apos;tan girilir). Kutunun barkodunu el
          okuyucu veya tabletin kamerasıyla okutun; ürün otomatik seçilir
          (tanımsızsa oracıkta ekleyebilirsiniz). Ardından lot numarası, son
          kullanma tarihi, adet ve depoyu girin. Kayıt doğrudan
          &quot;Serbest&quot; durumda açılır; QR etiketini yazdırıp ürünün
          üzerine yapıştırın. Form art arda giriş için seçimleri korur.
        </p>
      </header>

      <OnboardingForm
        companyId={companyId}
        materials={materials ?? []}
        locations={locationRows}
        defaultLocationId={defaultLocationId}
        canCreateProduct={canWriteCompanyData(role, STOCK_WRITE_ROLES)}
        trendyolProducts={trendyolProducts ?? []}
      />
    </div>
  );
}
