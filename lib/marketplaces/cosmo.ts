import "server-only";

import Anthropic from "@anthropic-ai/sdk";

// COSMO — the marketplace agent. The discount engine finds the opportunity and
// the percentage; COSMO writes the human-facing pitch and the campaign copy.
// Real copy comes from Claude when ANTHROPIC_API_KEY is set; otherwise we fall
// back to a deterministic template so the feature never hard-fails.

export type CosmoLead = {
  eventId: string;
  productName: string;
  daysLeft: number | null;
  expiryDate: string | null;
  oldPrice: number;
  newPrice: number;
  percent: number;
};

export type CosmoCopy = { headline: string; pitch: string };

const MODEL = "claude-opus-4-8";

const tl = (n: number) =>
  `${Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ₺`;

function templateCopy(lead: CosmoLead): CosmoCopy {
  const gun = lead.daysLeft !== null ? `${lead.daysLeft} gün` : "yakın SKT";
  return {
    headline: `Son ${gun}! ${lead.productName} — %${lead.percent} indirim`,
    pitch:
      `${lead.productName} için en yakın SKT ${gun} sonra. İndirim merdivenine ` +
      `göre %${lead.percent} indirim öneriyorum: ${tl(lead.oldPrice)} → ` +
      `${tl(lead.newPrice)}. Stok erimeden satışı hızlandırır.`,
  };
}

export function cosmoKeyConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Returns a map eventId -> {headline, pitch}. Uses Claude when configured,
 * falling back to the template per-lead on any error or missing key.
 */
export async function generateCosmoCopy(
  leads: CosmoLead[],
): Promise<Map<string, CosmoCopy>> {
  const out = new Map<string, CosmoCopy>();
  for (const lead of leads) out.set(lead.eventId, templateCopy(lead));
  if (leads.length === 0 || !process.env.ANTHROPIC_API_KEY) return out;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system:
        "Sen COSMO'sun: bir gıda takviyesi markasının Trendyol mağazasını yöneten " +
        "kıdemli bir pazaryeri uzmanı ve satış asistanısın. Son kullanma tarihi (SKT) " +
        "yaklaşan ürünleri stok erimeden satışa dönüştürmek için kısa, ikna edici, " +
        "abartısız ve Trendyol kurallarına uygun Türkçe metinler yazarsın. Sağlık " +
        "vaadi, 'mucize', 'tedavi' gibi ifadeler KULLANMA. Sadece istenen JSON'u döndür.",
      messages: [
        {
          role: "user",
          content:
            "Aşağıdaki indirim fırsatları için her biri hakkında: (1) 'headline' — " +
            "en fazla 60 karakter, dikkat çekici bir kampanya başlığı; (2) 'pitch' — " +
            "1-2 cümle, mağaza sahibine 'neden şimdi indirelim' diye anlatan samimi " +
            "bir öneri (fiyat ve gün bilgisini kullan). Yalnızca şu biçimde bir JSON " +
            'dizisi döndür: [{"eventId":"...","headline":"...","pitch":"..."}].\n\n' +
            JSON.stringify(
              leads.map((l) => ({
                eventId: l.eventId,
                urun: l.productName,
                kalan_gun: l.daysLeft,
                eski_fiyat: l.oldPrice,
                yeni_fiyat: l.newPrice,
                indirim_yuzde: l.percent,
              })),
            ),
        },
      ],
    });

    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    const json = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(json) as Array<{
      eventId?: string;
      headline?: string;
      pitch?: string;
    }>;
    for (const row of parsed) {
      if (row.eventId && out.has(row.eventId) && row.headline && row.pitch) {
        out.set(row.eventId, {
          headline: row.headline.slice(0, 120),
          pitch: row.pitch.slice(0, 600),
        });
      }
    }
  } catch {
    // Network/parse/auth issue — templates already populated.
  }

  return out;
}
