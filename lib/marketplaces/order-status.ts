// Trendyol shipmentPackageStatus → Turkish label + which ones mean "left the depot".

const LABELS: Record<string, string> = {
  Created: "Yeni",
  Awaiting: "Bekliyor",
  Picking: "Hazırlanıyor",
  Invoiced: "Faturalandı",
  Shipped: "Kargoda",
  AtCollectionPoint: "Teslim Noktasında",
  Delivered: "Teslim Edildi",
  UnDelivered: "Teslim Edilemedi",
  Cancelled: "İptal",
  UnSupplied: "Tedarik Edilemedi",
  Returned: "İade",
  UnPacked: "Paket Bölündü",
  Repack: "Yeniden Paketlendi",
};

type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "warning"
  | "destructive"
  | "success";

const VARIANTS: Record<string, BadgeVariant> = {
  Created: "outline",
  Awaiting: "outline",
  Picking: "warning",
  Invoiced: "warning",
  Shipped: "default",
  AtCollectionPoint: "default",
  Delivered: "success",
  UnDelivered: "destructive",
  Cancelled: "secondary",
  UnSupplied: "destructive",
  Returned: "destructive",
  UnPacked: "warning",
  Repack: "warning",
};

// Physically left the depot: stock must be deducted.
export const SHIPPED_STATUSES = [
  "Shipped",
  "AtCollectionPoint",
  "Delivered",
  "UnDelivered",
] as const;

// Order will not be (or was not) fulfilled: a deducted shipment must come back.
export const CANCELLED_STATUSES = ["Cancelled", "UnSupplied", "Returned"] as const;

export function trendyolStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return LABELS[status] ?? status;
}

export function trendyolStatusVariant(
  status: string | null | undefined,
): BadgeVariant {
  if (!status) return "secondary";
  return VARIANTS[status] ?? "secondary";
}

export function isShippedStatus(status: string | null | undefined): boolean {
  return !!status && (SHIPPED_STATUSES as readonly string[]).includes(status);
}

export function isCancelledStatus(status: string | null | undefined): boolean {
  return !!status && (CANCELLED_STATUSES as readonly string[]).includes(status);
}
