const TR_DATE = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const TR_DATETIME = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return TR_DATE.format(date);
}

export function formatDateTime(
  value: string | Date | null | undefined,
): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return TR_DATETIME.format(date);
}

export function companyStatusLabel(
  status: "active" | "suspended" | "archived" | string,
): string {
  switch (status) {
    case "active":
      return "Aktif";
    case "suspended":
      return "Askıda";
    case "archived":
      return "Arşivli";
    default:
      return status;
  }
}
