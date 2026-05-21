import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePlatformAdmin } from "@/lib/auth";
import { companyStatusLabel, formatDate, formatDateTime } from "@/lib/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CompanyRole } from "@/types/roles";
import { COMPANY_ROLE_LABELS } from "@/types/roles";

import { StatusActions } from "./status-actions";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invited?: string }>;
}

export default async function CompanyDetailPage({
  params,
  searchParams,
}: PageProps) {
  await requirePlatformAdmin();
  const { id } = await params;
  const { invited } = await searchParams;

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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Firma Kullanıcıları</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Firmaya bağlı kullanıcılar ve rolleri. Yeni bir üyeyi davet
              etmek için sağdaki butonu kullanın.
            </p>
          </div>
          <Link href={`/superadmin/companies/${company.id}/invite`}>
            <Button size="sm">Üye Davet Et</Button>
          </Link>
        </div>
        {invited === "1" ? (
          <p className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-600">
            Davet gönderildi. Kullanıcı e-postasındaki linke tıkladığında şifre
            belirleyip giriş yapabilecek.
          </p>
        ) : null}
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
                  {COMPANY_ROLE_LABELS[m.role as CompanyRole] ?? m.role}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
