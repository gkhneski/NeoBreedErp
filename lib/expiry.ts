export interface ExpiryThresholds {
  criticalDays: number;
  warningDays: number;
}

export const DEFAULT_EXPIRY_THRESHOLDS: ExpiryThresholds = {
  criticalDays: 90,
  warningDays: 180,
};

export type ExpiryUrgency = "expired" | "critical" | "warning" | "ok";

export function daysUntil(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const target = new Date(dateIso + "T00:00:00").getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86_400_000);
}

export function expiryUrgency(
  expiryDate: string | null,
  thresholds: ExpiryThresholds,
): ExpiryUrgency | null {
  const dte = daysUntil(expiryDate);
  if (dte === null) return null;
  if (dte < 0) return "expired";
  if (dte <= thresholds.criticalDays) return "critical";
  if (dte <= thresholds.warningDays) return "warning";
  return "ok";
}

export const EXPIRY_LABEL: Record<ExpiryUrgency, string> = {
  expired: "Süresi Geçti",
  critical: "Acil",
  warning: "Yaklaşan",
  ok: "Normal",
};

// Badge varyantlari 3 aciliyet rengini karsilamiyor; sabit sinif setiyle boyanir.
export const EXPIRY_BADGE_CLASS: Record<ExpiryUrgency, string> = {
  expired: "bg-red-600 text-white",
  critical: "bg-orange-500 text-white",
  warning: "bg-amber-400 text-black",
  ok: "bg-emerald-100 text-emerald-800",
};

export function isoDatePlusDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
