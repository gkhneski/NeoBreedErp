import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePlatformAdmin } from "@/lib/auth";
import { companyStatusLabel, formatDate } from "@/lib/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function CompaniesListPage() {
  await requirePlatformAdmin();
  const supabase = await createServerSupabaseClient();
  const { data: companies, error } = await supabase
    .from("companies")
    .select(
      "id, name, status, contact_name, contact_email, created_at",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Firmalar yüklenirken bir hata oluştu: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Firmalar</h1>
          <p className="text-sm text-muted-foreground">
            Platformdaki tüm kiracıları yönetin. Süper Admin firma içi
            operasyonları görmez.
          </p>
        </div>
        <Link href="/superadmin/companies/new">
          <Button>Firma Ekle</Button>
        </Link>
      </header>

      {(!companies || companies.length === 0) ? (
        <EmptyState
          title="Henüz kayıt yok"
          description="Platforma ilk firmayı eklemek için sağ üstteki butonu kullanın."
          action={
            <Link href="/superadmin/companies/new">
              <Button>Firma Ekle</Button>
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Firma</th>
                <th className="px-4 py-2 text-left font-medium">Yetkili</th>
                <th className="px-4 py-2 text-left font-medium">E-posta</th>
                <th className="px-4 py-2 text-left font-medium">Durum</th>
                <th className="px-4 py-2 text-left font-medium">Oluşturulma</th>
                <th className="px-4 py-2 text-right font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {companies.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2 font-medium text-foreground">
                    {row.name}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {row.contact_name ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {row.contact_email ?? "—"}
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
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/superadmin/companies/${row.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      Detayları Gör →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
