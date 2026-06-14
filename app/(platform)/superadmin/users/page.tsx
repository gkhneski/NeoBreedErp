import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CompanyRole } from "@/types/roles";
import { COMPANY_ROLE_LABELS } from "@/types/roles";

export default async function PlatformUsersPage() {
  await requirePlatformAdmin();
  const supabase = await createServerSupabaseClient();

  const { data: rows } = await supabase
    .from("company_users")
    .select(
      "user_id, role, created_at, company_id, companies(name)",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  type Row = {
    user_id: string;
    role: CompanyRole;
    created_at: string;
    company_id: string;
    companies: { name: string } | { name: string }[] | null;
  };
  const typed = (rows ?? []) as unknown as Row[];

  function companyName(c: Row["companies"]): string {
    if (!c) return "—";
    if (Array.isArray(c)) return c[0]?.name ?? "—";
    return c.name;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Firma Adminleri
        </h1>
        <p className="text-sm text-muted-foreground">
          Firmalara bağlı kullanıcı atamaları. Davet akışı sonraki fazda
          gelecek; şimdilik veritabanından yönetilir.
        </p>
      </header>

      {typed.length === 0 ? (
        <EmptyState
          title="Henüz kayıt yok"
          description="Bir firmaya kullanıcı atandığında bu listede görünecektir."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Kullanıcı</th>
                <th className="px-4 py-2 text-left font-medium">Firma</th>
                <th className="px-4 py-2 text-left font-medium">Rol</th>
                <th className="px-4 py-2 text-left font-medium">Eklenme</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {typed.map((row) => (
                <tr key={`${row.user_id}-${row.company_id}`}>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    {row.user_id}
                  </td>
                  <td className="px-4 py-2">{companyName(row.companies)}</td>
                  <td className="px-4 py-2">
                    <Badge
                      variant={
                        row.role === "company_admin" ? "default" : "secondary"
                      }
                    >
                      {COMPANY_ROLE_LABELS[row.role] ?? row.role}
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
    </div>
  );
}
