export interface LocationOption {
  id: string;
  code: string;
  name: string;
  kind: "depot" | "shelf";
  parent_id: string | null;
  is_default: boolean;
}

export interface LocationGroup<T extends LocationOption = LocationOption> {
  depot: T;
  shelves: T[];
}

export function groupLocations<T extends LocationOption>(
  rows: T[],
): LocationGroup<T>[] {
  const depots = rows.filter((r) => r.kind === "depot");
  const shelves = rows.filter((r) => r.kind === "shelf");
  return depots.map((depot) => ({
    depot,
    shelves: shelves.filter((s) => s.parent_id === depot.id),
  }));
}

export function shelfIdsOfDepot(
  rows: LocationOption[],
  depotId: string,
): string[] {
  return rows
    .filter((r) => r.kind === "shelf" && r.parent_id === depotId)
    .map((r) => r.id);
}
