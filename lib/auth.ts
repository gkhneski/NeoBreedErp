import "server-only";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ROUTE_COMPANY,
  ROUTE_LOGIN,
  ROUTE_PLATFORM,
  type CompanyRole,
  type SessionContext,
} from "@/types/roles";

const ACTIVE_COMPANY_COOKIE = "active_company_id";

export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: platformRow }, { data: memberships }] = await Promise.all([
    supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("company_users")
      .select("company_id, role")
      .eq("user_id", user.id)
      .is("deleted_at", null),
  ]);

  return {
    userId: user.id,
    email: user.email ?? null,
    isPlatformAdmin: !!platformRow,
    companyMemberships: (memberships ?? []).map((m) => ({
      companyId: m.company_id,
      role: m.role as CompanyRole,
    })),
  };
}

export async function requirePlatformAdmin(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect(ROUTE_LOGIN);
  if (!ctx.isPlatformAdmin) notFound();
  return ctx;
}

export async function requireCompanyUser(): Promise<{
  ctx: SessionContext;
  companyId: string;
  role: CompanyRole;
}> {
  const ctx = await getSessionContext();
  if (!ctx) redirect(ROUTE_LOGIN);

  if (ctx.companyMemberships.length === 0) {
    redirect(ROUTE_LOGIN + "?reason=no_company");
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value;

  const candidate =
    ctx.companyMemberships.find((m) => m.companyId === cookieValue) ??
    ctx.companyMemberships[0];

  return { ctx, companyId: candidate.companyId, role: candidate.role };
}

export function postLoginRedirectFor(ctx: SessionContext): string {
  if (ctx.isPlatformAdmin) return ROUTE_PLATFORM;
  if (ctx.companyMemberships.length > 0) return ROUTE_COMPANY;
  return ROUTE_LOGIN + "?reason=no_role";
}

export { ACTIVE_COMPANY_COOKIE };
