export type PlatformRole = "platform_admin";
export type CompanyRole = "company_admin" | "company_user";

export interface SessionContext {
  userId: string;
  email: string | null;
  isPlatformAdmin: boolean;
  companyMemberships: Array<{
    companyId: string;
    role: CompanyRole;
  }>;
}

export const ROUTE_LOGIN = "/login";
export const ROUTE_PLATFORM = "/superadmin";
export const ROUTE_COMPANY_PREFIX = "/c";

export function companyHomePath(companyId: string): string {
  return `${ROUTE_COMPANY_PREFIX}/${companyId}`;
}

export function companyModulePath(companyId: string, ...segments: string[]): string {
  const tail = segments.filter(Boolean).join("/");
  return tail ? `${companyHomePath(companyId)}/${tail}` : companyHomePath(companyId);
}
