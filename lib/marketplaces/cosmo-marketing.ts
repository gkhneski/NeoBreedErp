import "server-only";

import Anthropic from "@anthropic-ai/sdk";

// COSMO Marketing — the per-product strategist.
//
// Two layers:
//  1) generateMarketingReport  — per product, NO web. Fast Claude pass over our
//     real numbers (price, stock, SKT, 30-day velocity): price suggestion,
//     optimized title/description/bullets/keywords, sales strategy, listing audit.
//     One call PER PRODUCT (concurrency-pooled) so a long response never truncates
//     and one failure never nukes the rest — the old single-batch call did both.
//  2) researchCompetitors     — per product, LIVE web_search. COSMO actually
//     looks up comparable supplements on Trendyol, pulls real prices WITH source
//     URLs, says what rivals do well and where we stand, and recommends an
//     evidence-based price. This is the "ispatlı" comparison, not guesswork.
//
// Claude (Opus 4.8) powers both when ANTHROPIC_API_KEY is set; layer 1 falls back
// to a deterministic template so the panel still renders without a key.

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
};

export type CompetitorFinding = {
  name: string;
  price: number | null;
  url: string | null;
  note: string;
};

export type CompetitorResearch = {
  summary: string;
  findings: CompetitorFinding[];
  ourEdge: string[];
  theirEdge: string[];
  recommendedSalePrice: number;
  recommendedListPrice: number;
  rationale: string;
};

const MODEL = "claude-opus-4-8";
const POOL = 5;

const tl = (n: number) =>
  `${Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ₺`;

export function cosmoKeyConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const obj = body.match(/\{[\s\S]*\}/);
  return obj ? obj[0] : null;
}

// ---------------------------------------------------------------------------
// Layer 1 — per-product report (no web search)
// ---------------------------------------------------------------------------

function templateReport(p: MarketingInput): MarketingReport {
  const issues: string[] = [];
  if (!p.hasImage) issues.push("Ürün görseli eksik — listingin tıklanma oranını düşürür.");
  if (!p.currentTitle || p.currentTitle.length < 25)
    issues.push("Başlık kısa/zayıf — marka + form + miktar içermeli.");
  if (p.listPrice === null || p.listPrice <= p.salePrice)
    issues.push("Üstü çizili liste fiyatı yok — indirim algısı oluşmuyor.");
  if (p.unitsSold30d === 0)
    issues.push("Son 30 günde satış yok — fiyat/görünürlük gözden geçirilmeli.");

  const list =
    p.listPrice && p.listPrice > p.salePrice
      ? p.listPrice
      : Math.round(p.salePrice * 1.25);

  return {
    priceSalePrice: p.salePrice,
    priceListPrice: list,
    priceRationale:
      `Mevcut satış fiyatı ${tl(p.salePrice)}. Üstü çizili liste fiyatını ` +
      `${tl(list)} yaparak indirim algısı oluşturulabilir.`,
    title: p.currentTitle ?? p.productName,
    description: `${p.productName} için optimize açıklama (ANTHROPIC_API_KEY ile yazılır).`,
    bullets: ["Kaliteli içerik ve net miktar bilgisi", "Hızlı kargo ile stoktan teslim"],
    keywords: p.productName
      .toLowerCase()
      .split(/[^a-zçğıöşü0-9]+/i)
      .filter((w) => w.length > 2)
      .slice(0, 8),
    strategy:
      "Görsel + başlık + üstü çizili fiyat üçlüsünü güçlendir. Detaylı strateji için COSMO'yu Claude ile çalıştırın.",
    auditScore: Math.max(20, 100 - issues.length * 20),
    auditIssues: issues.length ? issues : ["Belirgin bir eksik görünmüyor."],
  };
}

type RawReport = Partial<Record<keyof MarketingReport, unknown>>;

function coerceReport(p: MarketingInput, raw: RawReport): MarketingReport {
  const fb = templateReport(p);
  const str = (v: unknown, d: string) =>
    typeof v === "string" && v.trim() ? v.trim() : d;
  const num = (v: unknown, d: number) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d;
  const arr = (v: unknown, d: string[]) =>
    Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, 10) : d;

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
    auditScore: Math.min(100, Math.max(0, Math.round(num(raw.auditScore, fb.auditScore)))),
    auditIssues: arr(raw.auditIssues, fb.auditIssues),
  };
}

const REPORT_SYSTEM =
  "Sen COSMO'sun: bir gıda takviyesi markasının Trendyol mağazasını yöneten kıdemli " +
  "pazaryeri ve dijital pazarlama stratejistisin. Trendyol başlık SEO, görsel, üstü " +
  "çizili fiyat, kampanya ve yorum dinamiklerini bilirsin.\n\n" +
  "KURALLAR:\n" +
  "- Sağlık vaadi YASAK: 'tedavi', 'iyileştirir', 'mucize', 'hastalık' gibi ifadeler kullanma. " +
  "Takviye gıda mevzuatına uygun, abartısız dil.\n" +
  "- Önerini ürünün gerçek verisine (fiyat, stok, SKT, son 30 gün satış) dayandır; SKT yakınsa " +
  "erime, satış yoksa görünürlük/fiyat testi öner.\n" +
  "- Başlık <=100 karakter, Trendyol SEO: marka + ürün + form + miktar.\n" +
  "- Türkçe yaz. SADECE istenen JSON nesnesini döndür.";

async function callReport(p: MarketingInput): Promise<MarketingReport> {
  const client = new Anthropic();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    system: REPORT_SYSTEM,
    messages: [
      {
        role: "user",
        content:
          "Şu ürünümüz için analiz üret ve SADECE şu alanlara sahip bir JSON nesnesi döndür: " +
          '{"priceSalePrice": sayı, "priceListPrice": sayı (satıştan büyük), ' +
          '"priceRationale": "1-2 cümle", "title": "<=100 char Trendyol başlığı", ' +
          '"description": "1 paragraf açıklama", "bullets": ["3-5 fayda"], ' +
          '"keywords": ["5-10 arama kelimesi"], "strategy": "2-4 cümle somut aksiyon", ' +
          '"auditScore": 0-100 sayı, "auditIssues": ["mevcut listingdeki eksikler"]}.\n\n' +
          "ÜRÜN:\n" +
          JSON.stringify({
            urun: p.productName,
            mevcut_baslik: p.currentTitle,
            satis_fiyati: p.salePrice,
            liste_fiyati: p.listPrice,
            stok_adet: p.stockUnits,
            skt_kalan_gun: p.daysToExpiry,
            son_30gun_satis: p.unitsSold30d,
            gorsel_var: p.hasImage,
          }),
      },
    ],
  });

  const message = await stream.finalMessage();
  const text = message.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  const json = extractJson(text);
  if (!json) return templateReport(p);
  return coerceReport(p, JSON.parse(json) as RawReport);
}

export async function generateMarketingReports(
  inputs: MarketingInput[],
): Promise<Map<string, MarketingReport>> {
  const out = new Map<string, MarketingReport>();
  for (const p of inputs) out.set(p.barcode, templateReport(p));
  if (inputs.length === 0 || !process.env.ANTHROPIC_API_KEY) return out;

  const results = await mapPool(inputs, POOL, async (p) => {
    try {
      return [p.barcode, await callReport(p)] as const;
    } catch {
      return [p.barcode, templateReport(p)] as const;
    }
  });
  for (const [barcode, report] of results) out.set(barcode, report);
  return out;
}

// ---------------------------------------------------------------------------
// Layer 2 — live competitor research (web_search)
// ---------------------------------------------------------------------------

type RawResearch = Partial<Record<keyof CompetitorResearch, unknown>>;

function coerceResearch(p: MarketingInput, raw: RawResearch): CompetitorResearch {
  const str = (v: unknown, d: string) =>
    typeof v === "string" && v.trim() ? v.trim() : d;
  const numOrNull = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const strArr = (v: unknown) =>
    Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, 8) : [];

  const findings: CompetitorFinding[] = Array.isArray(raw.findings)
    ? (raw.findings as unknown[]).slice(0, 8).map((f) => {
        const o = (f ?? {}) as Record<string, unknown>;
        return {
          name: str(o.name, "Rakip ürün"),
          price: numOrNull(o.price),
          url: typeof o.url === "string" && /^https?:\/\//.test(o.url) ? o.url : null,
          note: str(o.note, "").slice(0, 300),
        };
      })
    : [];

  const sale = numOrNull(raw.recommendedSalePrice) ?? p.salePrice;
  let list = numOrNull(raw.recommendedListPrice) ?? Math.round(sale * 1.2);
  if (list < sale) list = Math.round(sale * 1.2);

  return {
    summary: str(raw.summary, "Rakip taraması için yeterli sonuç bulunamadı.").slice(0, 800),
    findings,
    ourEdge: strArr(raw.ourEdge),
    theirEdge: strArr(raw.theirEdge),
    recommendedSalePrice: sale,
    recommendedListPrice: list,
    rationale: str(raw.rationale, "").slice(0, 600),
  };
}

const RESEARCH_SYSTEM =
  "Sen COSMO'sun: bir gıda takviyesi markasının Trendyol mağazası için canlı rakip ve " +
  "fiyat araştırması yapan kıdemli pazaryeri analistisin. web_search aracını kullanarak " +
  "Trendyol'da (trendyol.com) bu ürünle KARŞILAŞTIRILABİLİR takviye ürünlerini ara: aynı " +
  "etken madde/form/miktar. Gerçek satış fiyatlarını ve ürün/satıcı adını KAYNAK URL'siyle " +
  "topla. En az 3-6 rakip bulmaya çalış.\n\n" +
  "KURALLAR:\n" +
  "- Sadece gerçekten bulduğun, kaynağı olan fiyatları yaz. Fiyat bulamazsan price=null bırak, UYDURMA.\n" +
  "- Sağlık vaadi kullanma.\n" +
  "- Rakiplerin iyi yaptıkları (fiyat, başlık, görsel, yorum sayısı) ile bizim avantaj/eksiğimizi ayır.\n" +
  "- Fiyat önerini bulduğun rakip aralığına ve bizim mevcut fiyatımıza dayandır, gerekçelendir.\n" +
  "- Türkçe yaz. Aramalardan sonra CEVABINI SADECE tek bir JSON nesnesiyle bitir.";

export async function researchCompetitors(
  p: MarketingInput,
): Promise<CompetitorResearch> {
  const client = new Anthropic();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
    system: RESEARCH_SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `Ürünümüz: "${p.productName}". Mevcut Trendyol başlığımız: ` +
          `"${p.currentTitle ?? "-"}". Bizim satış fiyatımız: ${tl(p.salePrice)}. ` +
          "Trendyol'da bu ürünle karşılaştırılabilir takviyeleri araştır, gerçek " +
          "fiyatlarını kaynak linkiyle bul, bizimkiyle kıyasla ve kanıta dayalı bir " +
          "fiyat öner.\n\n" +
          "Araştırmayı bitirince SADECE şu biçimde tek bir JSON nesnesi döndür: " +
          '{"summary": "genel durum 2-3 cümle", "findings": [{"name": "rakip ürün/satıcı", ' +
          '"price": sayı veya null, "url": "kaynak link", "note": "kısa not"}], ' +
          '"ourEdge": ["bizim avantajlarımız"], "theirEdge": ["rakiplerin iyi yaptıkları"], ' +
          '"recommendedSalePrice": sayı, "recommendedListPrice": sayı, ' +
          '"rationale": "fiyat gerekçesi rakip aralığına dayalı"}.',
      },
    ],
  });

  const message = await stream.finalMessage();
  const text = message.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  const json = extractJson(text);
  if (!json) {
    return coerceResearch(p, {
      summary:
        "Canlı arama sonuç döndürmedi veya işlenemedi. Tekrar deneyin ya da ürün adını netleştirin.",
    });
  }
  return coerceResearch(p, JSON.parse(json) as RawResearch);
}
