import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireCompanyUser } from "@/lib/auth";
import {
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  normalizeSupportedCurrency,
} from "@/lib/currencies";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { formatBytes } from "@/lib/storage/attachments";
import {
  COMPANY_ROLE_LABELS,
  canManageCompanyUsers,
  companyModulePath,
  type CompanyRole,
} from "@/types/roles";

type SettingsJson =
  | string
  | number
  | boolean
  | null
  | { [key: string]: SettingsJson | undefined }
  | SettingsJson[];

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
  updated_at: string;
  packages: {
    name: string;
    user_limit: number;
    feature_flags: SettingsJson;
  } | null;
};

type RoleRow = { role: CompanyRole };
type CurrencyRow = { currency: string | null };
type BatchCurrencyRow = { cost_currency: string | null };
type FileRow = { size_bytes: number };

function DefinitionRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-3 border-b border-border py-2 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function StatCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
}) {
  return (
    <article className="rounded-md border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sublabel ? (
        <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
      ) : null}
    </article>
  );
}

function SettingsSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function PolicyCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-md border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </article>
  );
}

function featureFlagLabels(flags: SettingsJson): string[] {
  if (!flags || typeof flags !== "object" || Array.isArray(flags)) return [];
  return Object.entries(flags)
    .filter(([, value]) => value === true)
    .map(([key]) =>
      key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toLocaleUpperCase("tr-TR")),
    );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("tr-TR");
}

export default async function SettingsPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();
  const membershipClient = canManageCompanyUsers(role)
    ? createServiceRoleClient()
    : supabase;

  const [
    { data: company },
    { data: roles },
    { count: supplierCount },
    { count: materialCount },
    { count: finishedGoodCount },
    { count: lotCount },
    { count: releasedLotCount },
    { count: quarantineLotCount },
    { count: blockedLotCount },
    { count: draftQualityCount },
    { count: signedQualityCount },
    { count: activeProductionCount },
    { count: openProductionCount },
    { data: lotCurrencies },
    { data: batchCurrencies },
    { data: files },
  ] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "name, tax_number, contact_name, contact_email, contact_phone, address, status, updated_at, packages:package_id(name, user_limit, feature_flags)",
      )
      .eq("id", companyId)
      .maybeSingle<CompanyRow>(),
    membershipClient
      .from("company_users")
      .select("role")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .returns<RoleRow[]>(),
    supabase
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("materials")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("materials")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("type", "finished")
      .is("deleted_at", null),
    supabase
      .from("material_lots")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("material_lots")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "released")
      .is("deleted_at", null),
    supabase
      .from("material_lots")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "quarantine")
      .is("deleted_at", null),
    supabase
      .from("material_lots")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "blocked")
      .is("deleted_at", null),
    supabase
      .from("quality_checks")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "draft")
      .is("deleted_at", null),
    supabase
      .from("quality_checks")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("status", ["passed", "failed"])
      .is("deleted_at", null),
    supabase
      .from("production_orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("status", ["planned", "in_progress"])
      .is("deleted_at", null),
    supabase
      .from("production_orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("status", ["draft", "planned", "in_progress"])
      .is("deleted_at", null),
    supabase
      .from("material_lots")
      .select("currency")
      .eq("company_id", companyId)
      .not("currency", "is", null)
      .is("deleted_at", null)
      .returns<CurrencyRow[]>(),
    supabase
      .from("production_batches")
      .select("cost_currency")
      .eq("company_id", companyId)
      .not("cost_currency", "is", null)
      .is("deleted_at", null)
      .returns<BatchCurrencyRow[]>(),
    supabase
      .from("file_attachments")
      .select("size_bytes")
      .eq("company_id", companyId)
      .returns<FileRow[]>(),
  ]);

  const roleCounts = new Map<CompanyRole, number>();
  for (const row of roles ?? []) {
    roleCounts.set(row.role, (roleCounts.get(row.role) ?? 0) + 1);
  }

  const usedCurrencies = Array.from(
    new Set(
      [
        ...(lotCurrencies ?? []).map((row) => row.currency),
        ...(batchCurrencies ?? []).map((row) => row.cost_currency),
      ]
        .map((currency) => normalizeSupportedCurrency(currency))
        .filter(Boolean),
    ),
  );

  const storageBytes = (files ?? []).reduce(
    (sum, file) => sum + Number(file.size_bytes ?? 0),
    0,
  );
  const packageFlags = featureFlagLabels(company?.packages?.feature_flags ?? {});
  const seatLimit = company?.packages?.user_limit ?? null;
  const userCount = roles?.length ?? 0;
  const seatUsage =
    seatLimit && seatLimit > 0 ? `${userCount} / ${seatLimit}` : `${userCount}`;
  const actionItems = [
    company?.contact_email ? null : "Firma iletişim e-postası eksik.",
    company?.tax_number ? null : "Vergi numarası eksik.",
    seatLimit && userCount > seatLimit
      ? "Kullanıcı sayısı paket limitini aşıyor."
      : null,
    (quarantineLotCount ?? 0) > 0
      ? `${quarantineLotCount} lot karantinada bekliyor.`
      : null,
    (draftQualityCount ?? 0) > 0
      ? `${draftQualityCount} kalite kaydı taslak durumda.`
      : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Ayarlar</h1>
          <p className="text-sm text-muted-foreground">
            Firma kimliği, erişim, operasyon politikaları ve ERP kontrol
            noktaları.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={companyModulePath(companyId, "settings", "locations")}>
            <Button variant="outline">Depolar</Button>
          </Link>
          {canManageCompanyUsers(role) ? (
            <Link href={companyModulePath(companyId, "users")}>
              <Button>Kullanıcıları Yönet</Button>
            </Link>
          ) : null}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Kullanıcı / Limit" value={seatUsage} />
        <StatCard label="Tedarikçi" value={supplierCount ?? 0} />
        <StatCard label="Malzeme" value={materialCount ?? 0} />
        <StatCard label="Bitmiş Ürün" value={finishedGoodCount ?? 0} />
      </section>

      {actionItems.length > 0 ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <h2 className="font-medium">Dikkat Gerekenler</h2>
          <ul className="mt-2 space-y-1">
            {actionItems.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <SettingsSection title="Firma Kimliği">
            <div className="rounded-md border border-border p-4">
              <dl>
                <DefinitionRow label="Firma">
                  {company?.name ?? "—"}
                </DefinitionRow>
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
                <DefinitionRow label="Adres">
                  {company?.address ?? "—"}
                </DefinitionRow>
                <DefinitionRow label="Son Güncelleme">
                  {formatDate(company?.updated_at)}
                </DefinitionRow>
              </dl>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Erişim ve Roller"
            action={
              <Link href={companyModulePath(companyId, "users")}>
                <Button variant="outline" size="sm">
                  Kullanıcılar
                </Button>
              </Link>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from(roleCounts.entries()).map(([memberRole, count]) => (
                <StatCard
                  key={memberRole}
                  label={COMPANY_ROLE_LABELS[memberRole]}
                  value={count}
                />
              ))}
              {roleCounts.size === 0 ? (
                <StatCard label="Kayıtlı Rol" value="—" />
              ) : null}
            </div>
          </SettingsSection>

          <SettingsSection title="Operasyon Politikaları">
            <div className="grid gap-3 md:grid-cols-2">
              <PolicyCard
                label="Tenant İzolasyonu"
                value="URL + üyelik + RLS"
                detail="Aktif firma /c/:companyId yolundan doğrulanır; operasyonel sorgular company_id ile filtrelenir."
              />
              <PolicyCard
                label="Stok Modeli"
                value="Lot bazlı append-only hareket"
                detail="Stok miktarı hareket kayıtlarından oluşur; negatif lot ve hareket silme/güncelleme engellenir."
              />
              <PolicyCard
                label="Kalite Kontrol"
                value="Taslak + imza akışı"
                detail="QC imzası ayrı aksiyondur; serbest/bloke lot kararı kalite kaydına bağlanır."
              />
              <PolicyCard
                label="Maliyet"
                value="Batch snapshot"
                detail="Parti tamamlandığında lot maliyetleri dondurulur; işçilik ve genel gider MVP dışında."
              />
              <PolicyCard
                label="Dosya Depolama"
                value="Özel tenant-files bucket"
                detail={`Maksimum dosya boyutu ${formatBytes(10 * 1024 * 1024)}; yollar ${companyId}/... prefix'iyle ayrılır.`}
              />
              <PolicyCard
                label="Numaralandırma"
                value="Firma içinde benzersiz kodlar"
                detail="Lot, üretim emri, parti ve malzeme kodları firma sınırında benzersiz tutulur."
              />
            </div>
          </SettingsSection>

          <SettingsSection title="Para Birimi ve Maliyet">
            <div className="grid gap-3 md:grid-cols-3">
              <PolicyCard
                label="Varsayılan"
                value={DEFAULT_CURRENCY}
                detail="Boş maliyet para birimi şirket varsayılanı olarak ele alınır."
              />
              <PolicyCard
                label="Desteklenen"
                value={SUPPORTED_CURRENCIES.join(" / ")}
                detail="Lot maliyeti ve parti maliyet raporları bu para birimlerini ayrı ayrı izler."
              />
              <PolicyCard
                label="Kayıtlarda Görülen"
                value={usedCurrencies.length > 0 ? usedCurrencies.join(" / ") : "—"}
                detail="Mal kabul ve üretim maliyetlerinden okunan fiili para birimleri."
              />
            </div>
          </SettingsSection>
        </div>

        <aside className="space-y-6">
          <SettingsSection title="Paket">
            <div className="rounded-md border border-border p-4">
              <dl>
                <DefinitionRow label="Paket">
                  {company?.packages?.name ?? "Atanmamış"}
                </DefinitionRow>
                <DefinitionRow label="Kullanıcı Limiti">
                  {company?.packages?.user_limit ?? "—"}
                </DefinitionRow>
                <DefinitionRow label="Aktif Özellikler">
                  {packageFlags.length > 0 ? packageFlags.join(", ") : "—"}
                </DefinitionRow>
              </dl>
            </div>
          </SettingsSection>

          <SettingsSection title="Stok ve Kalite">
            <div className="grid gap-3">
              <StatCard
                label="Lot Durumu"
                value={lotCount ?? 0}
                sublabel={`${releasedLotCount ?? 0} serbest, ${quarantineLotCount ?? 0} karantina, ${blockedLotCount ?? 0} bloke`}
              />
              <StatCard
                label="QC"
                value={signedQualityCount ?? 0}
                sublabel={`${draftQualityCount ?? 0} taslak kayıt`}
              />
              <StatCard
                label="Üretim"
                value={activeProductionCount ?? 0}
                sublabel={`${openProductionCount ?? 0} açık emir`}
              />
            </div>
          </SettingsSection>

          <SettingsSection title="Dosyalar">
            <div className="grid gap-3">
              <StatCard label="Ek Sayısı" value={files?.length ?? 0} />
              <StatCard label="Kullanılan Alan" value={formatBytes(storageBytes)} />
            </div>
          </SettingsSection>

          <SettingsSection title="Kısayollar">
            <div className="grid gap-2">
              {[
                ["Tedarikçiler", companyModulePath(companyId, "suppliers")],
                ["Malzemeler", companyModulePath(companyId, "materials")],
                ["Stok", companyModulePath(companyId, "stock")],
                ["Kalite Kontrol", companyModulePath(companyId, "quality")],
                ["Maliyet Raporu", companyModulePath(companyId, "reports", "costs")],
              ].map(([label, href]) => (
                <Link key={href} href={href}>
                  <Button variant="outline" className="w-full justify-start">
                    {label}
                  </Button>
                </Link>
              ))}
            </div>
          </SettingsSection>
        </aside>
      </div>
    </div>
  );
}
