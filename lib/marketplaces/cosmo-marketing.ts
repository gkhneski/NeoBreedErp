import "server-only";

import Anthropic from "@anthropic-ai/sdk";

// COSMO Marketing — the per-product strategist. For each product COSMO writes a
// pricing recommendation, optimized Trendyol content (title/description/bullets/
// keywords), a sales strategy, a listing-quality audit, and a competitor read.
//
// Honesty note: Trendyol's seller API does NOT expose competitor prices/sales,
// so the competitor read is COSMO's general supplement-market knowledge, clearly
// framed as guidance — never invented live figures. Pricing and audit lean on the
// real numbers we DO have (our price, stock, expiry, sales velocity).
//
// Claude (Opus 4.8) powers it when ANTHROPIC_API_KEY is set; otherwise a
// deterministic template keeps the feature alive.

export type MarketingInput = {
  barcode: string;
  productName: string;
  currentTitle: string | null;
  salePrice: number;
  listPrice: number | null;
  stockUnits: number;
  daysToExpiry: number | null;
  unitsSold30d: number;
  hasImage: boolean;
};

export type MarketingReport = {
  priceSalePrice: number;
  priceListPrice: number;
  priceRationale: string;
  title: string;
  description: string;
  bullets: string[];
  keywords: string[];
  strategy: string;
  auditScore: number;
  auditIssues: string[];
  competitor: string;
};

const MODEL = "claude-opus-4-8";
const MAX_PRODUCTS = 40;

const tl = (n: number) =>
  `${Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ₺`;

export function cosmoKeyConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function templateReport(p: MarketingInput): MarketingReport {
  const issues: string[] = [];
  if (!p.hasImage) issues.push("Ürün görseli eksik — listingin tıklanma oranını düşürür.");
  if (!p.currentTitle || p.currentTitle.length < 25)
    issues.push("Başlık kısa/zayıf — marka + form + miktar içermeli.");
  if (p.listPrice === null || p.listPrice <= p.salePrice)
    issues.push("Üstü çizili liste fiyatı yok — indirim algısı oluşmuyor.");
  if (p.unitsSold30d === 0)
    issues.push("Son 30 günde satış yok — fiyat/görünürlük gözden geçirilmeli.");

  const list = p.listPrice && p.listPrice > p.salePrice
    ? p.listPrice
    : Math.round(p.salePrice * 1.25);

  return {
    priceSalePrice: p.salePrice,
    priceListPrice: list,
    priceRationale:
      `Mevcut satış fiyatı ${tl(p.salePrice)}. Üstü çizili liste fiyatını ` +
      `${tl(list)} yaparak indirim algısı oluşturulabilir. ` +
      (p.unitsSold30d === 0
        ? "Satış olmadığı için önce görünürlük/fiyat testi önerilir."
        : `Son 30 günde ${p.unitsSold30d} adet satış var, fiyat dengeli görünüyor.`),
    title: p.currentTitle ?? p.productName,
    description:
      `${p.productName} — Trendyol ürün açıklaması burada optimize edilir ` +
      `(içerik, kullanım, paket bilgisi). ANTHROPIC_API_KEY tanımlanınca COSMO ` +
      `tam metni yazar.`,
    bullets: [
      "Kaliteli içerik ve net miktar bilgisi",
      "Güvenilir üretim ve takviye standardı",
      "Hızlı kargo ile stoktan teslim",
    ],
    keywords: p.productName
      .toLowerCase()
      .split(/[^a-zçğıöşü0-9]+/i)
      .filter((w) => w.length > 2)
      .slice(0, 8),
    strategy:
      "Görsel + başlık + üstü çizili fiyat üçlüsünü güçlendir; ilk yorumlar için " +
      "kampanya kur. Detaylı strateji için COSMO'yu Claude ile çalıştırın.",
    auditScore: Math.max(20, 100 - issues.length * 20),
    auditIssues: issues.length ? issues : ["Belirgin bir eksik görünmüyor."],
    competitor:
      "Rakip karşılaştırması için COSMO'nun Claude ile çalışması gerekir " +
      "(Trendyol satıcı API'si rakip fiyatı vermez; bu kısım piyasa bilgisine dayanır).",
  };
}

type RawReport = Partial<Record<keyof MarketingReport, unknown>> & {
  barcode?: string;
};

function coerce(p: MarketingInput, raw: RawReport): MarketingReport {
  const fb = templateReport(p);
  const str = (v: unknown, d: string) =>
    typeof v === "string" && v.trim() ? v.trim() : d;
  const num = (v: unknown, d: number) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d;
  const arr = (v: unknown, d: string[]) =>
    Array.isArray(v)
      ? v.map((x) => String(x)).filter(Boolean).slice(0, 10)
      : d;

  const sale = num(raw.priceSalePrice, fb.priceSalePrice);
  let list = num(raw.priceListPrice, fb.priceListPrice);
  if (list < sale) list = Math.round(sale * 1.2);

  return {
    priceSalePrice: sale,
    priceListPrice: list,
    priceRationale: str(raw.priceRationale, fb.priceRationale).slice(0, 600),
    title: str(raw.title, fb.title).slice(0, 100),
    description: str(raw.description, fb.description).slice(0, 1500),
    bullets: arr(raw.bullets, fb.bullets),
    keywords: arr(raw.keywords, fb.keywords),
    strategy: str(raw.strategy, fb.strategy).slice(0, 800),
    auditScore: Math.min(
      100,
      Math.max(0, Math.round(num(raw.auditScore, fb.auditScore))),
    ),
    auditIssues: arr(raw.auditIssues, fb.auditIssues),
    competitor: str(raw.competitor, fb.competitor).slice(0, 800),
  };
}

const SYSTEM =
  "Sen COSMO'sun: bir gıda takviyesi (food supplement) markasının Trendyol " +
  "mağazasını yöneten kıdemli bir pazaryeri ve dijital pazarlama stratejistisin. " +
  "Türkiye e-ticaret ve Trendyol algoritması (başlık SEO, görsel, üstü çizili " +
  "fiyat, kampanya, yorum/puan) konusunda uzmansın. Görevin: verilen her ürün için " +
  "fiyatlama, içerik ve satış stratejisi üretmek.\n\n" +
  "KURALLAR:\n" +
  "- Sağlık vaadi YASAK: 'tedavi eder', 'iyileştirir', 'mucize', 'hastalık' gibi " +
  "ifadeler kullanma. Takviye gıda mevzuatına uygun, abartısız dil kullan.\n" +
  "- Rakip bilgisi: Trendyol satıcı API'si rakip fiyatı/satışı vermez. Rakip " +
  "karşılaştırmasını GENEL piyasa bilgine dayandır ve 'tahmini/genel eğilim' olarak " +
  "çerçevele. ASLA uydurma kesin rakip fiyatı veya marka iddiası verme.\n" +
  "- Fiyat önerini bizim gerçek verimize (mevcut fiyat, stok, SKT, son 30 gün satış) " +
  "dayandır. SKT yaklaşıyorsa erime stratejisi, satış yoksa görünürlük/fiyat testi öner.\n" +
  "- Başlık en fazla 100 karakter, Trendyol SEO'ya uygun: marka + ürün + form + miktar.\n" +
  "- Türkçe yaz. SADECE istenen JSON'u döndür, başka metin yok.";

/**
 * Returns a map barcode -> MarketingReport. Uses Claude when configured,
 * falling back to a template per product on any error or missing key.
 */
export async function generateMarketingReports(
  inputsAll: MarketingInput[],
): Promise<Map<string, MarketingReport>> {
  const inputs = inputsAll.slice(0, MAX_PRODUCTS);
  const out = new Map<string, MarketingReport>();
  for (const p of inputs) out.set(p.barcode, templateReport(p));
  if (inputs.length === 0 || !process.env.ANTHROPIC_API_KEY) return out;

  try {
    const client = new Anthropic();
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content:
            "Aşağıdaki ürünlerimiz için her biri hakkında bir analiz üret. Her ürün " +
            "için şu alanları içeren bir nesne döndür:\n" +
            '- "barcode": ürünün barkodu (aynen geri ver)\n' +
            '- "priceSalePrice": önerilen satış fiyatı (sayı, TL)\n' +
            '- "priceListPrice": önerilen üstü çizili liste fiyatı (sayı, satıştan büyük)\n' +
            '- "priceRationale": fiyat gerekçesi (1-2 cümle)\n' +
            '- "title": optimize Trendyol başlığı (<=100 karakter)\n' +
            '- "description": optimize ürün açıklaması (1 paragraf)\n' +
            '- "bullets": 3-5 maddelik fayda listesi (dizi)\n' +
            '- "keywords": 5-10 arama anahtar kelimesi (dizi)\n' +
            '- "strategy": bu ürünü nasıl daha çok satarız (2-4 cümle somut aksiyon)\n' +
            '- "auditScore": mevcut listingimizin kalite puanı 0-100 (sayı)\n' +
            '- "auditIssues": mevcut listingdeki eksikler (dizi)\n' +
            '- "competitor": rakiplere göre konumumuz ve onların iyi yaptıkları ' +
            "(genel piyasa bilgisine dayalı, tahmini olduğunu belirt)\n\n" +
            "Yalnızca şu biçimde bir JSON dizisi döndür: [{...}, {...}].\n\n" +
            "ÜRÜNLER:\n" +
            JSON.stringify(
              inputs.map((p) => ({
                barcode: p.barcode,
                urun: p.productName,
                mevcut_baslik: p.currentTitle,
                satis_fiyati: p.salePrice,
                liste_fiyati: p.listPrice,
                stok_adet: p.stockUnits,
                skt_kalan_gun: p.daysToExpiry,
                son_30gun_satis: p.unitsSold30d,
                gorsel_var: p.hasImage,
              })),
            ),
        },
      ],
    });

    const message = await stream.finalMessage();
    const text = message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    const json = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(json) as RawReport[];
    const byBarcode = new Map(
      parsed.filter((r) => r.barcode).map((r) => [String(r.barcode), r]),
    );
    for (const p of inputs) {
      const raw = byBarcode.get(p.barcode);
      if (raw) out.set(p.barcode, coerce(p, raw));
    }
  } catch {
    // Network/parse/auth issue — templates already populated.
  }

  return out;
}
