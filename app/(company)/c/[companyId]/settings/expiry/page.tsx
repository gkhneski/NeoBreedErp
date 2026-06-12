import Link from "next/link";

import { requireCompanyRole } from "@/lib/auth";
import { getExpiryThresholds } from "@/lib/company-settings";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { ExpiryForm } from "./expiry-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function ExpirySettingsPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    MASTER_DATA_WRITE_ROLES,
  );

  const supabase = await createServerSupabaseClient();
  const { data: settingsRow } = await supabase
    .from("company_settings")
    .select("company_id")
    .eq("company_id", companyId)
    .maybeSingle();
  const thresholds = await getExpiryThresholds(companyId);

  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          <Link
            href={companyModulePath(companyId, "settings")}
            className="hover:underline"
          >
            ← Ayarlar
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Son Kullanma (SKT) Eşikleri
        </h1>
        <p className="text-sm text-muted-foreground">
          Panel ve lot listelerindeki renk kodlaması bu eşiklere göre çalışır:
          süresi geçen lotlar kırmızı, &quot;Acil&quot; eşiğinin altındakiler
          turuncu, &quot;Yaklaşan&quot; eşiğinin altındakiler sarı gösterilir.
          {settingsRow
            ? ""
            : " Henüz özel değer kaydedilmedi; varsayılanlar geçerli."}
        </p>
      </header>

      <section className="rounded-md border border-border bg-card/40 p-4">
        <ExpiryForm
          companyId={companyId}
          criticalDays={thresholds.criticalDays}
          warningDays={thresholds.warningDays}
        />
      </section>
    </div>
  );
}
