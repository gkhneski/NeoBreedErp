import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePlatformAdmin } from "@/lib/auth";
import { companyStatusLabel, formatDate, formatDateTime } from "@/lib/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { StatusActions } from "./status-actions";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CompanyDetailPage({ params }: PageProps) {
  await requirePlatformAdmin();
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, name, tax_number, contact_name, contact_email, contact_phone, address, package_id, status, created_at, updated_at, deleted_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!company || company.deleted_at) notFound();

  const [{ data: pkg }, { data: admins }] = await Promise.all([
    company.package_id
      ? supabase
          .from("packages")
          .select("name")
          .eq("id", company.package_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("company_users")
      .select("user_id, role, created_at")
      .eq("company_id", company.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const fields: Array<{ label: string; value: string | null }> = [
    { label: "Firma Adı", value: company.name },
    { label: "Vergi Numarası", value: company.tax_number },
    { label: "Yetkili", value: company.contact_name },
    { label: "Yetkili E-posta", value: company.contact_email },
    { label: "Telefon", value: company.contact_phone },
    { label: "Adres", value: company.address },
    { label: "Paket", value: pkg?.name ?? null },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">
            <Link
              href="/superadmin/companies"
              className="hover:text-foreground"
            >
              Firmalar
            </Link>{" "}
            / {company.name}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {company.name}
          </h1>
        </div>
        <Badge
          variant={
            company.status === "active"
              ? "success"
              : company.status === "suspended"
                ? "warning"
                : "secondary"
          }
        >
          {companyStatusLabel(company.status)}
        </Badge>
      </div>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Firma Bilgileri</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.label}>
              <dt className="text-xs text-muted-foreground">{f.label}</dt>
              <dd className="mt-0.5 text-sm">{f.value ?? "—"}</dd>
            </div>
          ))}
          <div>
            <dt className="text-xs text-muted-foreground">Oluşturulma</dt>
            <dd className="mt-0.5 text-sm">
              {formatDateTime(company.created_at)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Son Güncelleme</dt>
            <dd className="mt-0.5 text-sm">
              {formatDateTime(company.updated_at)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Durum Yönetimi</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Askıya alma ve arşivleme kullanıcı verisini silmez; yalnızca
          erişimi kısıtlar.
        </p>
        <div className="mt-3">
          <StatusActions
            companyId={company.id}
            currentStatus={company.status}
          />
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Firma Kullanıcıları</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Firmaya bağlı kullanıcılar ve rolleri. Davet akışı Phase 5 sonrası
          için planlandı.
        </p>
        {!admins || admins.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="Henüz kullanıcı yok"
              description="Firma kullanıcıları davet edildiğinde burada listelenir."
            />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border text-sm">
            {admins.map((m) => (
              <li
                key={m.user_id}
                className="flex items-center justify-between py-2"
              >
                <div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {m.user_id}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Eklenme: {formatDate(m.created_at)}
                  </p>
                </div>
                <Badge variant={m.role === "company_admin" ? "default" : "secondary"}>
                  {m.role === "company_admin" ? "Firma Admini" : "Kullanıcı"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
