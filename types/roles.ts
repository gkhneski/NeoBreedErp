export type PlatformRole = "platform_admin";
export const COMPANY_ROLE_VALUES = [
  "company_admin",
  "production_manager",
  "quality_manager",
  "operator",
  "viewer",
  "company_user",
  "regional_manager",
] as const;

export type CompanyRole = (typeof COMPANY_ROLE_VALUES)[number];

export const COMPANY_ROLE_LABELS: Record<CompanyRole, string> = {
  company_admin: "Firma Admini",
  production_manager: "Uretim Sorumlusu",
  quality_manager: "Kalite Sorumlusu",
  operator: "Operator",
  viewer: "Salt Okuma",
  company_user: "Firma Kullanicisi",
  regional_manager: "Bolge Muduru",
};

export const COMPANY_ROLE_BADGE_LABELS: Record<CompanyRole, string> = {
  company_admin: "FIRMA ADMINI",
  production_manager: "URETIM",
  quality_manager: "KALITE",
  operator: "OPERATOR",
  viewer: "OKUMA",
  company_user: "KULLANICI",
  regional_manager: "BOLGE",
};

export const COMPANY_WRITE_ROLES = [
  "company_admin",
  "production_manager",
  "quality_manager",
  "operator",
  "company_user",
] as const satisfies readonly CompanyRole[];

export const MASTER_DATA_WRITE_ROLES = [
  "company_admin",
  "production_manager",
  "company_user",
] as const satisfies readonly CompanyRole[];

export const PRODUCTION_WRITE_ROLES = [
  "company_admin",
  "production_manager",
  "operator",
  "company_user",
] as const satisfies readonly CompanyRole[];

export const QUALITY_WRITE_ROLES = [
  "company_admin",
  "quality_manager",
  "company_user",
] as const satisfies readonly CompanyRole[];

export const STOCK_WRITE_ROLES = [
  "company_admin",
  "production_manager",
  "operator",
  "company_user",
] as const satisfies readonly CompanyRole[];

export const FILE_WRITE_ROLES = [
  "company_admin",
  "production_manager",
  "quality_manager",
  "company_user",
] as const satisfies readonly CompanyRole[];

export const SHIPMENT_WRITE_ROLES = [
  "company_admin",
  "production_manager",
  "operator",
  "company_user",
] as const satisfies readonly CompanyRole[];

// B2B satis siparisleri: depocu gelen siparisi yonetir; bolge muduru eczaneler
// adina siparis girer. Eczaci (harici alici) company_users degil — portal RLS'i
// ile ayri yetkilenir, bu listede yer almaz.
export const ORDER_WRITE_ROLES = [
  "company_admin",
  "production_manager",
  "operator",
  "company_user",
  "regional_manager",
] as const satisfies readonly CompanyRole[];

// Pazaryeri fiyat onay kuyrugu: depocu tek dokunusla onaylar/reddeder.
export const MARKETPLACE_APPROVE_ROLES = [
  "company_admin",
  "production_manager",
  "operator",
  "company_user",
] as const satisfies readonly CompanyRole[];

// Pazaryeri listing yonetimi (liste cekme, eslestirme, kural, manuel gonderim,
// SKT taramasi). Listingler yalnizca bitmis urun oldugundan depocu de tam yetkili.
// API kimlik bilgileri haric (o company_admin: settings/marketplaces).
export const MARKETPLACE_WRITE_ROLES = [
  "company_admin",
  "production_manager",
  "operator",
  "company_user",
] as const satisfies readonly CompanyRole[];

// operator = depo personeli: yalnizca depo odakli moduller.
// Lotlar/hammadde fabrika konusu; depo yalnizca bitmis urun stogunu, raf
// dagilimini, SKT/son kullanma takibini ve sevkiyati gorur.
// Diger roller tum modulleri gorur; yazma yetkileri *_WRITE_ROLES ile ayrica sinirlanir.
const OPERATOR_MODULES = new Set([
  "",
  "stock",
  "warehouse",
  "shipments",
  "marketplace",
  "sales",
  // Depocu gelen B2B siparisleri gorur ve sevkiyata donusturur. ("orders" anahtari
  // uretim is listesine ait; B2B satis siparisleri ayri "sales-orders".)
  "sales-orders",
  // Depocu urun komuta merkezini salt-okunur gorur: stok + pazaryeri durumu.
  // Yazma/duzenleme/yeni urun MASTER_DATA_WRITE_ROLES ile zaten engelli.
  "products",
  // Depocu eldeki bitmis urunu barkod okutarak girer; tam "lots" modulu
  // (hammadde/fabrika lotlari) acilmaz, yalnizca onboarding ekrani.
  "lots/onboarding",
]);

// Bolge muduru = ic personel ama satis odakli: depo stok + uretim durumunu
// (salt-okunur) gorur, eczaneler adina siparis girer. Ana veri/kalite/kullanici
// yonetimi YOK.
const REGIONAL_MANAGER_MODULES = new Set([
  "",
  "sales-orders",
  "products",
  "stock",
  "production",
  "sales",
  "customers",
]);

export function canAccessModule(
  role: CompanyRole,
  moduleKey: string,
): boolean {
  if (role === "operator") return OPERATOR_MODULES.has(moduleKey);
  if (role === "regional_manager") return REGIONAL_MANAGER_MODULES.has(moduleKey);
  return true;
}

export function canManageCompanyUsers(role: CompanyRole): boolean {
  return role === "company_admin";
}

export function canWriteCompanyData(
  role: CompanyRole,
  allowed: readonly CompanyRole[],
): boolean {
  return allowed.includes(role);
}

export interface SessionContext {
  userId: string;
  email: string | null;
  isPlatformAdmin: boolean;
  companyMemberships: Array<{
    companyId: string;
    role: CompanyRole;
  }>;
  // Harici eczane alicilari: company_users degil, bir musteriye bagli portal
  // kullanicilari. ERP'ye giremezler; yalnizca /portal yuzeyini gorurler.
  buyerMemberships: Array<{
    companyId: string;
    customerId: string;
  }>;
}

export const ROUTE_LOGIN = "/login";
export const ROUTE_PLATFORM = "/superadmin";
export const ROUTE_COMPANY_PREFIX = "/c";
export const ROUTE_PORTAL_PREFIX = "/portal";

export function companyHomePath(companyId: string): string {
  return `${ROUTE_COMPANY_PREFIX}/${companyId}`;
}

export function portalHomePath(companyId: string): string {
  return `${ROUTE_PORTAL_PREFIX}/${companyId}`;
}

export function companyModulePath(companyId: string, ...segments: string[]): string {
  const tail = segments.filter(Boolean).join("/");
  return tail ? `${companyHomePath(companyId)}/${tail}` : companyHomePath(companyId);
}
