export const SUPPORTED_CURRENCIES = ["TRY", "USD", "EUR"] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const DEFAULT_CURRENCY: SupportedCurrency = "TRY";

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(value as SupportedCurrency);
}

export function normalizeSupportedCurrency(
  value: FormDataEntryValue | string | null | undefined,
): SupportedCurrency | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return isSupportedCurrency(normalized) ? normalized : null;
}
