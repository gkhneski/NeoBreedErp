export const KIND_LABEL: Record<"receipt" | "issue" | "adjustment", string> = {
  receipt: "Mal Kabul",
  issue: "Çıkış",
  adjustment: "Düzeltme",
};

export const KIND_VARIANT: Record<
  "receipt" | "issue" | "adjustment",
  "default" | "secondary" | "warning" | "destructive"
> = {
  receipt: "default",
  issue: "secondary",
  adjustment: "warning",
};
