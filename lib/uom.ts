// Unit-of-measure conversion within a dimension (mass / volume). Recipe items
// may be authored in g while the material's stock lots are in kg, etc. Returns
// null when the two units are not convertible (different dimensions or unknown),
// so callers can fall back to "no conversion".

const MASS_IN_G: Record<string, number> = { mg: 0.001, g: 1, kg: 1000 };
const VOLUME_IN_ML: Record<string, number> = { mL: 1, L: 1000 };

// Human-facing label for a stored UOM code. "unit" is stored in English but
// shown to Turkish depot users as "adet" (here = boxes/sellable units, not pills).
const UOM_LABELS: Record<string, string> = { unit: "adet" };

export function uomLabel(uom: string | null | undefined): string {
  if (!uom) return "";
  return UOM_LABELS[uom] ?? uom;
}

export function convertQuantity(
  value: number,
  from: string,
  to: string,
): number | null {
  if (from === to) return value;
  if (from in MASS_IN_G && to in MASS_IN_G) {
    return (value * MASS_IN_G[from]) / MASS_IN_G[to];
  }
  if (from in VOLUME_IN_ML && to in VOLUME_IN_ML) {
    return (value * VOLUME_IN_ML[from]) / VOLUME_IN_ML[to];
  }
  return null;
}
