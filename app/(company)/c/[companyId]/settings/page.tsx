import { Badge } from "@/components/ui/badge";
import { requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type CompanyRow = {
  name: string;
  tax_number: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  status: "active" | "suspended" | "archived";
  packages: { name: string; user_limit: number } | null;
};

function DefinitionRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 border-b border-border py-2 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default async function SettingsPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const { data: company } = await supabase
    .from("companies")
    .select(
      "name, tax_number, contact_name, contact_email, contact_phone, address, status, packages:package_id(name, user_limit)",
    )
    .eq("id", companyId)
    .maybeSingle<CompanyRow>();

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Ayarlar</h1>
        <p className="text-sm text-muted-foreground">
          Firma bilgileri, paket ve operasyonel erişim özeti.
        </p>
      </header>

      <section className="rounded-md border border-border p-4">
        <h2 className="mb-2 text-sm font-medium">Firma Bilgileri</h2>
        <dl>
          <DefinitionRow label="Firma">{company?.name ?? "—"}</DefinitionRow>
          <DefinitionRow label="Durum">
            <Badge
              variant={
                company?.status === "active"
                  ? "success"
                  : company?.status === "suspended"
                    ? "warning"
                    : "secondary"
              }
            >
              {company?.status ?? "—"}
            </Badge>
          </DefinitionRow>
          <DefinitionRow label="Vergi No">
            {company?.tax_number ?? "—"}
          </DefinitionRow>
          <DefinitionRow label="Yetkili">
            {company?.contact_name ?? "—"}
          </DefinitionRow>
          <DefinitionRow label="E-posta">
            {company?.contact_email ?? "—"}
          </DefinitionRow>
          <DefinitionRow label="Telefon">
            {company?.contact_phone ?? "—"}
          </DefinitionRow>
          <DefinitionRow label="Adres">{company?.address ?? "—"}</DefinitionRow>
        </dl>
      </section>

      <section className="rounded-md border border-border p-4">
        <h2 className="mb-2 text-sm font-medium">Paket</h2>
        <dl>
          <DefinitionRow label="Paket">
            {company?.packages?.name ?? "Atanmamış"}
          </DefinitionRow>
          <DefinitionRow label="Kullanıcı Limiti">
            {company?.packages?.user_limit ?? "—"}
          </DefinitionRow>
        </dl>
      </section>
    </div>
  );
}
