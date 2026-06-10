import "server-only";

import { cache } from "react";
import { notFound, redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ROUTE_LOGIN,
  ROUTE_PLATFORM,
  companyHomePath,
  canWriteCompanyData,
  type CompanyRole,
  type SessionContext,
} from "@/types/roles";

// cache(): layout ve page ayni request icinde ikisi de cagirir; auth + rol
// sorgulari render basina bir kez calisir.
export const getSessionContext = cache(
  async (): Promise<SessionContext | null> => {
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
  },
);

export async function requirePlatformAdmin(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect(ROUTE_LOGIN);
  if (!ctx.isPlatformAdmin) notFound();
  return ctx;
}

export async function requireCompanyUser(companyId: string): Promise<{
  ctx: SessionContext;
  companyId: string;
  role: CompanyRole;
}> {
  const ctx = await getSessionContext();
  if (!ctx) redirect(ROUTE_LOGIN);

  if (ctx.companyMemberships.length === 0) {
    redirect(ROUTE_LOGIN + "?reason=no_company");
  }

  const membership = ctx.companyMemberships.find(
    (m) => m.companyId === companyId,
  );
  if (!membership) notFound();

  return { ctx, companyId: membership.companyId, role: membership.role };
}

export async function requireCompanyRole(
  companyId: string,
  allowedRoles: readonly CompanyRole[],
): Promise<{
  ctx: SessionContext;
  companyId: string;
  role: CompanyRole;
}> {
  const membership = await requireCompanyUser(companyId);
  if (!canWriteCompanyData(membership.role, allowedRoles)) notFound();
  return membership;
}

export function postLoginRedirectFor(ctx: SessionContext): string {
  if (ctx.isPlatformAdmin) return ROUTE_PLATFORM;
  if (ctx.companyMemberships.length > 0) {
    return companyHomePath(ctx.companyMemberships[0].companyId);
  }
  return ROUTE_LOGIN + "?reason=no_role";
}
