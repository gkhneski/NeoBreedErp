import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type Brain = "claude" | "openai";

const CLAUDE_MODEL = "claude-opus-4-8";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

export function openAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

async function runClaude(system: string, prompt: string): Promise<string> {
  const client = new Anthropic();
  const stream = client.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 1600,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    system,
    messages: [{ role: "user", content: prompt }],
  });
  const message = await stream.finalMessage();
  return message.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
}

async function runOpenAI(system: string, prompt: string): Promise<string> {
  const client = new OpenAI();
  const res = await client.chat.completions.create({
    model: OPENAI_MODEL,
    max_completion_tokens: 1600,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}

// Dispatch by brain. OpenAI agents fall back to Claude when no OPENAI_API_KEY so
// the boardroom still runs (degraded to single-brain) instead of failing.
export async function runBrain(
  brain: Brain,
  system: string,
  prompt: string,
): Promise<{ text: string; model: string }> {
  if (brain === "openai" && openAiConfigured()) {
    return { text: await runOpenAI(system, prompt), model: `openai:${OPENAI_MODEL}` };
  }
  return { text: await runClaude(system, prompt), model: `claude:${CLAUDE_MODEL}` };
}

export type AgentDef = {
  key: string;
  name: string;
  brain: Brain;
  role: string;
  persona: string;
};

const COMMON_RULES =
  "KURALLAR:\n" +
  "- Sadece sana verilen GERÇEK brifing verisine dayan; veri uydurma. Ürünlere " +
  "ref koduyla atıf yap (ör. P3), isim de ekleyebilirsin.\n" +
  "- Sağlık vaadi YASAK ('tedavi', 'iyileştirir', 'mucize' vb.). Takviye gıda " +
  "mevzuatına uygun, abartısız dil.\n" +
  "- KISA ve SOMUT konuş (en fazla ~150 kelime). Genel laf değil, uygulanabilir " +
  "aksiyon. Önceki ajanlara ismen atıfta bulun; katıl ya da gerekçeyle karşı çık.\n" +
  "- Türkçe konuş. Sadece kendi repliğini yaz (rol etiketi/JSON ekleme).";

// The boardroom roster. COSMO = Claude (existing brain), ATLAS/VERA = OpenAI so two
// real models debate. Order = speaking order each round.
export const AGENTS: AgentDef[] = [
  {
    key: "ATLAS",
    name: "ATLAS",
    brain: "openai",
    role: "Operasyon Denetçisi",
    persona:
      "Sen ATLAS'sın: acımasız ve detaycı bir operasyon denetçisi. Brifingdeki " +
      "açıkları, riskleri ve tutarsızlıkları (stoksuz ama listede, satışsız, " +
      "görselsiz, onaysız, listelenmemiş, SKT yakın, web sayfası yok) madde madde " +
      "ortaya çıkarırsın. En kritik 3-5 soruna odaklan, abartma, gerçeği söyle.\n\n" +
      COMMON_RULES,
  },
  {
    key: "COSMO",
    name: "COSMO",
    brain: "claude",
    role: "Pazaryeri & Görünürlük Stratejisti",
    persona:
      "Sen COSMO'sun: Trendyol pazaryeri ve arama görünürlüğü stratejistisin. " +
      "ATLAS'ın bulgularına Trendyol sıralaması (satış ivmesi, görsel, başlık SEO, " +
      "üstü çizili fiyat, stok, onay) açısından yanıt verirsin ve her soruna somut " +
      "pazaryeri aksiyonu önerirsin.\n\n" +
      COMMON_RULES,
  },
  {
    key: "VERA",
    name: "VERA",
    brain: "openai",
    role: "Satış & Marka Stratejisti",
    persona:
      "Sen VERA'sın: satış ve marka büyüme stratejistisin. Markayı daha iyi yere " +
      "taşımaya odaklanırsın: konumlandırma, web içerik/SEO (rehber yazıları), " +
      "kampanya fikri, çapraz satış, fiyat algısı. Uzun vadeli büyüme açısından " +
      "konuşur, COSMO ve ATLAS'ın söylediklerini tamamlarsın.\n\n" +
      COMMON_RULES,
  },
];

export const SYNTHESIZER: AgentDef = {
  key: "SENTEZ",
  name: "Sentez",
  brain: "claude",
  role: "Moderatör",
  persona:
    "Sen kurulun moderatörüsün. Tartışmayı bağla ve önceliklendirilmiş, somut bir " +
    "AKSIYON LİSTESİ üret. Sadece brifingde gerçekten var olan ref'lere aksiyon yaz.",
};
