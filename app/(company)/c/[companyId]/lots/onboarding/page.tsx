import Link from "next/link";

import { requireCompanyRole } from "@/lib/auth";
import type { LocationOption } from "@/lib/locations";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STOCK_WRITE_ROLES, companyModulePath } from "@/types/roles";

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
};

export default async function LotOnboardingPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    STOCK_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const [{ data: materials }, { data: locations }] = await Promise.all([
    supabase
      .from("materials")
      .select("id, code, name, type, base_uom")
      .eq("company_id", companyId)
      .is("deleted_at", null)
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
          Depoda halihazırda bulunan ürünleri hızlıca kaydedin: ürün, lot
          numarası, son kullanma tarihi, adet ve raf. Kayıt doğrudan
          &quot;Serbest&quot; durumda açılır; ardından QR etiketini yazdırıp
          ürünün üzerine yapıştırın. Form art arda giriş için ürün, SKT ve
          konum seçimini korur.
        </p>
      </header>

      <OnboardingForm
        companyId={companyId}
        materials={materials ?? []}
        locations={locationRows}
        defaultLocationId={defaultLocationId}
      />
    </div>
  );
}
