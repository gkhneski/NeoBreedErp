import type { ShipmentChannel, ShipmentStatus } from "@/types/database";

export const CHANNEL_LABEL: Record<ShipmentChannel, string> = {
  ecza: "Ecza Deposu",
  trendyol: "Trendyol",
  hepsiburada: "Hepsiburada",
  diger: "Diğer",
};

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  open: "Açık",
  preparing: "Hazırlanıyor",
  shipped: "Gönderildi",
  cancelled: "İptal",
};

export const SHIPMENT_STATUS_VARIANT: Record<
  ShipmentStatus,
  "default" | "secondary" | "outline" | "warning" | "destructive" | "success"
> = {
  open: "outline",
  preparing: "warning",
  shipped: "success",
  cancelled: "secondary",
};
