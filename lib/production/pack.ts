// Ürün adından paket boyunu (kutu içi adet) ve formu otomatik çıkarır.
// Örn: "ACVISION FOLITA 30 TABLET" -> { packSize: 30, kind: "solid" }
//      "Stoncare 60 Softjel Kapsül" -> { packSize: 60, kind: "solid" }
//      "LAYLA Damla 50ml"           -> { packSize: null, kind: "liquid", volumeMl: 50 }
// Böylece üretim/stok "300.000 adet" yerine otomatik "10.000 kutu" gösterebilir —
// kullanıcının hiçbir şey girmesine gerek kalmadan.

export type Pack = {
  packSize: number | null; // katı ürünler için kutu içi adet
  kind: "solid" | "liquid" | "unknown";
  form: string | null; // tablet / kapsül / softjel / saşe / damla / sprey...
  volumeMl: number | null; // sıvılar için şişe hacmi
};

// Sayının HEMEN ardından gelen form kelimesi (200 MG'yi değil, 30 KAPSÜL'ü yakalar).
// Lookbehind: sayı bir harf/rakama bitişikse SAYMA — "B12 TABLET"teki 12'yi eler.
const SOLID_RE =
  /(?<![\p{L}\d])(\d+)\s*(tablet|kaps[üu]l|softjel|[şs]a[şs]e|pastil|emme|çiğneme)/iu;
const ML_RE = /(\d+)\s*ml\b/i;
const LIQUID_WORDS = /(damla|sprey|[şs]urup|jel|krem|s[ıi]v[ıi]|drop)/i;

export function parsePack(name: string): Pack {
  const n = name ?? "";

  const ml = n.match(ML_RE);
  const isLiquidWord = LIQUID_WORDS.test(n);

  const solid = n.match(SOLID_RE);
  // Katı form + sayı varsa kutu boyu odur (sıvı kelimesi olsa bile öncelik sayıda değil:
  // "30 Tablet" katıdır). Ama ml/sıvı kelimesi varsa ve katı sayı yoksa sıvıdır.
  if (solid) {
    const size = Number(solid[1]);
    return {
      packSize: Number.isFinite(size) && size > 0 ? size : null,
      kind: "solid",
      form: solid[2].toLowerCase(),
      volumeMl: null,
    };
  }

  if (ml || isLiquidWord) {
    return {
      packSize: null,
      kind: "liquid",
      form: isLiquidWord ? (n.match(LIQUID_WORDS)![1].toLowerCase()) : "sıvı",
      volumeMl: ml ? Number(ml[1]) : null,
    };
  }

  return { packSize: null, kind: "unknown", form: null, volumeMl: null };
}

// "300.000 adet" -> "10.000 kutu (30'lu)" gibi bir alt-etiket üretir (yoksa null).
export function boxBreakdown(
  plannedQuantity: number,
  name: string,
): string | null {
  const pack = parsePack(name);
  if (pack.kind !== "solid" || !pack.packSize || pack.packSize <= 1) return null;
  const boxes = plannedQuantity / pack.packSize;
  if (!Number.isFinite(boxes) || boxes <= 0) return null;
  const boxesStr =
    Number.isInteger(boxes)
      ? boxes.toLocaleString("tr-TR")
      : boxes.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
  return `= ${boxesStr} kutu (${pack.packSize}'li)`;
}

// "unit" jenerik etiketini "adet" gibi okunur hale getirir.
export function unitLabelForDisplay(uom: string): string {
  return uom === "unit" ? "adet" : uom;
}
