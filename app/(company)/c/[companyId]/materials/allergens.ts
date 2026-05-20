export const ALLERGEN_CODES = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soybeans",
  "milk",
  "nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "mollusks",
] as const;

export type AllergenCode = (typeof ALLERGEN_CODES)[number];

export const ALLERGEN_LABELS: Record<AllergenCode, string> = {
  gluten: "Gluten",
  crustaceans: "Kabuklular",
  eggs: "Yumurta",
  fish: "Balık",
  peanuts: "Yer fıstığı",
  soybeans: "Soya",
  milk: "Süt",
  nuts: "Sert kabuklu yemişler",
  celery: "Kereviz",
  mustard: "Hardal",
  sesame: "Susam",
  sulphites: "Sülfitler",
  lupin: "Acıbakla",
  mollusks: "Yumuşakçalar",
};
