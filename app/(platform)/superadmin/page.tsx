import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePlatformAdmin } from "@/lib/auth";
import { companyStatusLabel, formatDate } from "@/lib/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface DashboardStats {
  totalCompanies: number;
  activeCompanies: number;
  suspendedCompanies: number;
  totalUsers: number;
  activePackages: number;
}

async function loadStats(): Promise<DashboardStats> {
  const supabase = await createServerSupabaseClient();
  const [companiesAll, companiesActive, companiesSuspended, users, packages] =
    await Promise.all([
      supabase
        .from("companies")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      supabase
        .from("companies")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .is("deleted_at", null),
      supabase
        .from("companies")
        .select("id", { count: "exact", head: true })
        .eq("status", "suspended")
        .is("deleted_at", null),
      supabase
        .from("company_users")
        .select("user_id", { count: "exact", head: true })
        .is("deleted_at", null),
      supabase.from("packages").select("id", { count: "exact", head: true }),
    ]);

  return {
    totalCompanies: companiesAll.count ?? 0,
    activeCompanies: companiesActive.count ?? 0,
    suspendedCompanies: companiesSuspended.count ?? 0,
    totalUsers: users.count ?? 0,
    activePackages: packages.count ?? 0,
  };
}

async function loadRecentCompanies() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("companies")
    .select("id, name, status, contact_name, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(5);
  return data ?? [];
}

export default async function PlatformDashboardPage() {
  await requirePlatformAdmin();
  const [stats, recent] = await Promise.all([
    loadStats(),
    loadRecentCompanies(),
  ]);

  const cards = [
    { label: "Toplam Firma", value: stats.totalCompanies },
    { label: "Aktif Firma", value: stats.activeCompanies },
    { label: "Askıdaki Firma", value: stats.suspendedCompanies },
    { label: "Toplam Kullanıcı", value: stats.totalUsers },
    { label: "Aktif Paket", value: stats.activePackages },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Platform Özeti
        </h1>
        <p className="text-sm text-muted-foreground">
          Platform Sahibi: Gökhan Eski. Firma operasyonlarına erişilmez —
          sadece firma yaşam döngüsü ve paket yönetimi.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <article
            key={c.label}
            className="rounded-md border border-border bg-card p-4"
          >
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
              {c.value}
            </p>
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="text-sm font-semibold">Son Eklenen Firmalar</h2>
          <Link
            href="/superadmin/companies"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Tümünü gör →
          </Link>
        </div>

        {recent.length === 0 ? (
          <EmptyState
            title="Henüz firma yok"
            description="Yeni firma ekleyerek başlayın. Firma oluşturulduğunda ilk yetkili e-postası üzerinden Firma Admini davet edilir."
          />
        ) : (
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Firma</th>
                  <th className="px-4 py-2 text-left font-medium">Yetkili</th>
                  <th className="px-4 py-2 text-left font-medium">Durum</th>
                  <th className="px-4 py-2 text-left font-medium">
                    Oluşturulma
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recent.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2">
                      <Link
                        href={`/superadmin/companies/${row.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {row.contact_name ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <Badge
                        variant={
                          row.status === "active"
                            ? "success"
                            : row.status === "suspended"
                              ? "warning"
                              : "secondary"
                        }
                      >
                        {companyStatusLabel(row.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {formatDate(row.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <aside className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-xs text-muted-foreground">
        Süper Admin; firmaların üretim, stok, reçete, kalite veya maliyet
        verilerine erişmez. Bkz. <code>docs/SUPERADMIN_RULES.md</code>.
      </aside>
    </div>
  );
}
