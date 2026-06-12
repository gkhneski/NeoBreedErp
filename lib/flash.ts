export type FlashKind =
  | "created"
  | "updated"
  | "deleted"
  | "saved"
  | "transferred";

export function withFlash(path: string, kind: FlashKind): string {
  return `${path}${path.includes("?") ? "&" : "?"}flash=${kind}`;
}
