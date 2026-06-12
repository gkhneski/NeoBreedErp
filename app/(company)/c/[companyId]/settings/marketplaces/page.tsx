import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { requireCompanyUser } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

import { ConnectionForm } from "./connection-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

function maskHint(secret: string): string {
  return `••••${secret.slice(-4)}`;
}

export default async function MarketplaceSettingsPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireCompanyUser(routeCompanyId);
  if (role !== "company_admin") notFound();

  const service = createServiceRoleClient();
  const { data: connection } = await service
    .from("marketplace_connections")
    .select("seller_id, api_key, api_secret, enabled, last_verified_at")
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .maybeSingle();

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
          Pazaryeri Bağlantıları
        </h1>
        <p className="text-sm text-muted-foreground">
          Satıcı paneli API bilgileri. Anahtarlar yalnızca sunucuda saklanır ve
          asla tarayıcıya gönderilmez. Trendyol bilgilerini Satıcı Paneli →
          Hesap Bilgilerim → Entegrasyon Bilgileri&apos;nden alabilirsiniz.
        </p>
      </header>

      <section className="space-y-4 rounded-md border border-border bg-card/40 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Trendyol</h2>
          {connection ? (
            connection.enabled ? (
              <Badge variant="success">Aktif</Badge>
            ) : (
              <Badge variant="secondary">Devre Dışı</Badge>
            )
          ) : (
            <Badge variant="outline">Bağlı Değil</Badge>
          )}
          {connection?.last_verified_at ? (
            <span className="text-xs text-muted-foreground">
              Son doğrulama:{" "}
              {new Date(connection.last_verified_at).toLocaleString("tr-TR")}
            </span>
          ) : null}
        </div>
        <ConnectionForm
          companyId={companyId}
          channel="trendyol"
          initial={
            connection
              ? {
                  seller_id: connection.seller_id,
                  api_key_hint: maskHint(connection.api_key),
                  api_secret_hint: maskHint(connection.api_secret),
                  enabled: connection.enabled,
                }
              : null
          }
        />
      </section>

      <section className="space-y-2 rounded-md border border-border bg-card/40 p-4 opacity-70">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Hepsiburada</h2>
          <Badge variant="outline">Yakında</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Hepsiburada entegrasyonu bir sonraki fazda aynı altyapı üzerine
          eklenecek.
        </p>
      </section>
    </div>
  );
}
