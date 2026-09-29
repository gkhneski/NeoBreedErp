import { convertQuantity } from "@/lib/uom";

import { unitLabelForDisplay } from "./pack";

function formatNumber(n: number): string {
  return n.toLocaleString("tr-TR", { maximumSignificantDigits: 4 });
}

// Birim başına içerik miktarını etiket diliyle yazar: 1,061 g -> "1.061 mg",
// 0,00004 g -> "40 mcg".
export function formatContentAmount(value: number, uom: string): string {
  const mg = convertQuantity(value, uom, "mg");
  if (mg !== null) {
    if (mg >= 10_000) return `${formatNumber(mg / 1000)} g`;
    if (mg >= 1) return `${formatNumber(mg)} mg`;
    return `${formatNumber(mg * 1000)} mcg`;
  }
  const ml = convertQuantity(value, uom, "mL");
  if (ml !== null) {
    return ml >= 1000
      ? `${formatNumber(ml / 1000)} L`
      : `${formatNumber(ml)} mL`;
  }
  return `${formatNumber(value)} ${unitLabelForDisplay(uom)}`;
}

export type ContentRecipe = {
  yield_quantity: number;
  yield_uom: string;
  recipe_items: Array<{
    position: number;
    quantity: number;
    uom: string;
    active: boolean;
    materials: { code: string; name: string } | null;
  }>;
};

export type ContentBlock = {
  basis: string;
  items: Array<{ code: string; name: string; amount: string }>;
};

// Reçeteyi "1 birim içeriği"ne indirger. factor = bir baz birime düşen reçete
// verimi oranı (ör. 1 tablet için 1 / 1.000).
export function contentBlock(
  recipe: ContentRecipe,
  basis: string,
  factor: number,
): ContentBlock {
  return {
    basis,
    items: recipe.recipe_items
      .filter((i) => i.active && i.materials)
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        code: i.materials!.code,
        name: i.materials!.name,
        amount: formatContentAmount(Number(i.quantity) * factor, i.uom),
      })),
  };
}
