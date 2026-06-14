import { Badge } from "@/components/ui/badge";
import { requireModuleAccess } from "@/lib/auth";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import type { CompanyRole } from "@/types/roles";
import { COMPANY_ROLE_LABELS, canManageCompanyUsers } from "@/types/roles";

import { ChangeRoleSelect } from "./change-role-select";
import { InviteUserForm } from "./invite-user-form";
import { ResendPasswordButton } from "./resend-password-button";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type MemberRow = {
  user_id: string;
  role: CompanyRole;
  created_at: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type CompanyRow = {
  contact_email: string | null;
  contact_name: string | null;
};

function nameFromEmail(email: string | null | undefined): string {
  if (!email) return "İsimsiz kullanıcı";
  const localPart = email.split("@")[0] ?? "";
  const readable = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR") + part.slice(1))
    .join(" ");
  return readable || "İsimsiz kullanıcı";
}

function displayNameFor(
  profile: ProfileRow | null,
  company: CompanyRow | null,
): string {
  if (profile?.full_name) return profile.full_name;
  if (
    profile?.email &&
    company?.contact_email &&
    profile.email.toLowerCase() === company.contact_email.toLowerCase() &&
    company.contact_name
  ) {
    return company.contact_name;
  }
  return nameFromEmail(profile?.email);
}

export default async function UsersPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireModuleAccess(routeCompanyId, "users");
  const supabase = canManageCompanyUsers(role)
    ? createServiceRoleClient()
    : await createServerSupabaseClient();

  const [{ data: company }, { data: members, error: membersError }] =
    await Promise.all([
      supabase
        .from("companies")
        .select("contact_email, contact_name")
        .eq("id", companyId)
        .maybeSingle<CompanyRow>(),
      supabase
        .from("company_users")
        .select("user_id, role, created_at")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .returns<MemberRow[]>(),
    ]);

  if (membersError) {
    throw new Error(membersError.message);
  }

  const memberRows = members ?? [];
  const userIds = memberRows.map((member) => member.user_id);
  const { data: profiles, error: profilesError } =
    userIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, email, full_name")
          .in("id", userIds)
          .returns<ProfileRow[]>()
      : { data: [] as ProfileRow[], error: null };

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const profilesById = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile]),
  );
  const rows = memberRows.map((member) => ({
    ...member,
    profile: profilesById.get(member.user_id) ?? null,
  }));

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

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Kullanıcı</th>
              <th className="px-3 py-2 text-left font-medium">E-posta</th>
              <th className="px-3 py-2 text-left font-medium">Rol</th>
              <th className="px-3 py-2 text-left font-medium">Eklenme</th>
              {canManageCompanyUsers(role) ? (
                <th className="px-3 py-2 text-right font-medium">İşlem</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((member) => {
              const displayName = displayNameFor(member.profile, company);

              return (
              <tr key={member.user_id} className="border-t border-border">
                <td className="px-3 py-2">
                  {displayName}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {member.profile?.email ?? "—"}
                </td>
                <td className="px-3 py-2">
                  {canManageCompanyUsers(role) ? (
                    <ChangeRoleSelect
                      companyId={companyId}
                      userId={member.user_id}
                      currentRole={member.role}
                    />
                  ) : (
                    <Badge
                      variant={
                        member.role === "company_admin" ? "default" : "secondary"
                      }
                    >
                      {COMPANY_ROLE_LABELS[member.role]}
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(member.created_at).toLocaleDateString("tr-TR")}
                </td>
                {canManageCompanyUsers(role) ? (
                  <td className="px-3 py-2 text-right">
                    <ResendPasswordButton
                      companyId={companyId}
                      userId={member.user_id}
                    />
                  </td>
                ) : null}
              </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={canManageCompanyUsers(role) ? 5 : 4}
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
