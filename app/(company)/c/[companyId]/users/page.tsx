import { Badge } from "@/components/ui/badge";
import { requireCompanyUser } from "@/lib/auth";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import type { CompanyRole } from "@/types/roles";
import { COMPANY_ROLE_LABELS, canManageCompanyUsers } from "@/types/roles";

import { InviteUserForm } from "./invite-user-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type MemberRow = {
  user_id: string;
  role: CompanyRole;
  created_at: string;
  profiles: { email: string | null; full_name: string | null } | null;
};

export default async function UsersPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireCompanyUser(routeCompanyId);
  const supabase = canManageCompanyUsers(role)
    ? createServiceRoleClient()
    : await createServerSupabaseClient();

  const { data: members } = await supabase
    .from("company_users")
    .select("user_id, role, created_at, profiles:user_id(email, full_name)")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .returns<MemberRow[]>();

  const rows = members ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Kullanıcılar</h1>
        <p className="text-sm text-muted-foreground">
          Bu firmaya bağlı kullanıcılar ve rolleri.
        </p>
      </header>

      {canManageCompanyUsers(role) ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Kullanıcı Davet Et</h2>
          <InviteUserForm companyId={companyId} />
        </section>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Kullanıcı</th>
              <th className="px-3 py-2 text-left font-medium">E-posta</th>
              <th className="px-3 py-2 text-left font-medium">Rol</th>
              <th className="px-3 py-2 text-left font-medium">Eklenme</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((member) => (
              <tr key={member.user_id} className="border-t border-border">
                <td className="px-3 py-2">
                  {member.profiles?.full_name ?? "İsimsiz kullanıcı"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {member.profiles?.email ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <Badge
                    variant={
                      member.role === "company_admin" ? "default" : "secondary"
                    }
                  >
                    {COMPANY_ROLE_LABELS[member.role]}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(member.created_at).toLocaleDateString("tr-TR")}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  Görüntülenebilir kullanıcı kaydı yok.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
