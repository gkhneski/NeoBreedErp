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
export const ROUTE_COMPANY = "/app";
