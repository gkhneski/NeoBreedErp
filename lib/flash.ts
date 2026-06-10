export type FlashKind = "created" | "updated" | "deleted" | "saved";

export function withFlash(path: string, kind: FlashKind): string {
  return `${path}${path.includes("?") ? "&" : "?"}flash=${kind}`;
}
