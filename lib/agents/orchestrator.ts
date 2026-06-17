import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { AgentActionKind } from "@/types/database";

import { AGENTS, SYNTHESIZER, runBrain } from "./models";
import { gatherBusinessSnapshot, type BusinessSnapshot, type SnapshotItem } from "./snapshot";

const ROUNDS = 2;

type Turn = { agent: string; content: string };

export async function runBoardroom(
  companyId: string,
  focus: string | null,
  createdBy: string | null,
): Promise<{ sessionId: string }> {
  const supabase = createServiceRoleClient();

  const { data: session, error: sErr } = await supabase
    .from("agent_sessions")
    .insert({ company_id: companyId, status: "running", focus, created_by: createdBy })
    .select("id")
    .single();
  if (sErr || !session) throw new Error(sErr?.message ?? "Oturum açılamadı.");
  const sessionId = session.id;

  let seq = 0;
  const insertMessage = async (
    agent: string,
    model: string | null,
    kind: "briefing" | "agent" | "synthesis",
    content: string,
  ) => {
    await supabase.from("agent_messages").insert({
      company_id: companyId,
      session_id: sessionId,
      seq: seq++,
      agent,
      model,
      kind,
      content,
    });
  };

  try {
    const snapshot = await gatherBusinessSnapshot(companyId);
    const briefing = buildBriefing(snapshot, focus);
    await insertMessage("Brifing", null, "briefing", briefing);

    const transcript: Turn[] = [];
    for (let round = 0; round < ROUNDS; round++) {
      for (const agent of AGENTS) {
        const prompt = buildAgentPrompt(briefing, transcript, agent.name, round);
        let text = "";
        let model: string | null = null;
        try {
          const out = await runBrain(agent.brain, agent.persona, prompt);
          text = out.text;
          model = out.model;
        } catch {
          text = "(Bu turda yanıt üretemedim, geçiyorum.)";
        }
        if (!text) text = "(boş yanıt)";
        transcript.push({ agent: agent.name, content: text });
        await insertMessage(`${agent.name} · ${agent.role}`, model, "agent", text);
      }
    }

    // Synthesis → action list.
    const synthPrompt = buildSynthPrompt(briefing, transcript);
    let synthText = "";
    let synthModel: string | null = null;
    try {
      const out = await runBrain(SYNTHESIZER.brain, SYNTHESIZER.persona, synthPrompt);
      synthText = out.text;
      synthModel = out.model;
    } catch {
      synthText = "";
    }

    const { summary, actions } = parseSynthesis(synthText, snapshot);
    await insertMessage(
      "Sentez · Öncelikli Aksiyonlar",
      synthModel,
      "synthesis",
      summary || "Aksiyon listesi üretilemedi.",
    );

    if (actions.length > 0) {
      await supabase.from("agent_actions").insert(
        actions.map((a) => ({
          company_id: companyId,
          session_id: sessionId,
          kind: a.kind,
          ref: a.ref,
          title: a.title,
          payload: a.payload,
          status: "proposed" as const,
        })),
      );
    }

    await supabase
      .from("agent_sessions")
      .update({ status: "done", finished_at: new Date().toISOString() })
      .eq("id", sessionId);
  } catch (e) {
    await supabase
      .from("agent_sessions")
      .update({
        status: "error",
        error: e instanceof Error ? e.message : "bilinmeyen hata",
        finished_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
  }

  return { sessionId };
}

// ---------------------------------------------------------------------------

function buildBriefing(s: BusinessSnapshot, focus: string | null): string {
  const t = s.totals;
  const lines: string[] = [];
  lines.push(`# ${s.companyName} — Durum Brifingi`);
  if (focus) lines.push(`Owner odağı: ${focus}`);
  lines.push(
    `Ürün: ${t.products} · Trendyol'da listede: ${t.listed} · Yayınlı web sayfası: ` +
      `${t.publishedSitePages} · Görselli: ${t.withImage} · Stoksuz: ${t.outOfStock} · ` +
      `30g satışsız: ${t.zeroSales30d} · Onaysız: ${t.unapproved} · Web sayfası yok: ${t.noSitePage}`,
  );
  lines.push(
    `Satış trendi (adet): son 30g ${s.trend.sold30d} vs önceki 30g ${s.trend.sold30dPrev} ` +
      `(${s.trend.orders30d} sipariş/30g).`,
  );
  lines.push("");
  lines.push("Ürünler (yalnızca bunlara aksiyon önerilebilir):");
  for (const it of s.items) {
    lines.push(
      `- ${it.ref} "${it.name}" | fiyat: ${it.salePrice ?? "—"} | stok: ${it.stock} | ` +
        `30g satış: ${it.sold30d} (önceki ${it.sold30dPrev}) | ` +
        `${it.flags.length ? "SORUNLAR: " + it.flags.join(", ") : "sorun yok"}`,
    );
  }
  return lines.join("\n");
}

function buildAgentPrompt(
  briefing: string,
  transcript: Turn[],
  speaker: string,
  round: number,
): string {
  const convo = transcript.length
    ? transcript.map((t) => `${t.agent}: ${t.content}`).join("\n\n")
    : "(Henüz konuşan olmadı; tartışmayı sen başlatıyorsun.)";
  const roundNote =
    round === 0
      ? "İlk tur. Kendi açından en kritik noktaları ortaya koy."
      : "İkinci tur. Tekrar etme; öncekilere yanıt ver, netleştir, önceliklendir.";
  return (
    `BRİFİNG:\n${briefing}\n\n` +
    `ŞİMDİYE KADARKİ KONUŞMA:\n${convo}\n\n` +
    `Sıra sende (${speaker}). ${roundNote} Sadece kendi repliğini yaz.`
  );
}

function buildSynthPrompt(briefing: string, transcript: Turn[]): string {
  const convo = transcript.map((t) => `${t.agent}: ${t.content}`).join("\n\n");
  return (
    `BRİFİNG:\n${briefing}\n\n` +
    `KURUL TARTIŞMASI:\n${convo}\n\n` +
    "Bu tartışmayı bağla. ÖNCE 2-4 cümlelik kısa bir özet yaz. SONRA bir JSON bloğu " +
    "ver: önceliklendirilmiş aksiyonlar. Her aksiyon brifingdeki bir ref'e bağlı " +
    "olmalı (site_article hariç). Geçerli kind'ler:\n" +
    '- "price": ürün fiyat önerisi → {"ref","kind":"price","title","salePrice": sayı}\n' +
    '- "site_product": o ürün için web sayfası taslağı → {"ref","kind":"site_product","title"}\n' +
    '- "image": eksik Trendyol görselini çek → {"ref","kind":"image","title"}\n' +
    '- "visibility": Trendyol görünürlük notu → {"ref","kind":"visibility","title","note"}\n' +
    '- "site_article": long-tail rehber yazısı → {"kind":"site_article","title","topic"}\n\n' +
    'Format: {"summary":"...","actions":[ ... ]}. En fazla 8 aksiyon. SADECE bu JSON.'
  );
}

// ---------------------------------------------------------------------------

type ResolvedAction = {
  kind: AgentActionKind;
  ref: string | null;
  title: string;
  payload: Record<string, unknown>;
};

function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const obj = body.match(/\{[\s\S]*\}/);
  return obj ? obj[0] : null;
}

function parseSynthesis(
  text: string,
  snapshot: BusinessSnapshot,
): { summary: string; actions: ResolvedAction[] } {
  const byRef = new Map<string, SnapshotItem>(snapshot.items.map((i) => [i.ref, i]));
  const json = extractJson(text);
  if (!json) {
    return { summary: text.trim().slice(0, 1200), actions: [] };
  }
  let raw: { summary?: unknown; actions?: unknown };
  try {
    raw = JSON.parse(json);
  } catch {
    return { summary: text.replace(json, "").trim().slice(0, 1200), actions: [] };
  }

  const summary =
    typeof raw.summary === "string" && raw.summary.trim()
      ? raw.summary.trim()
      : text.replace(json, "").trim().slice(0, 1200);

  const actions: ResolvedAction[] = [];
  const list = Array.isArray(raw.actions) ? raw.actions : [];
  for (const a of list.slice(0, 12)) {
    const o = (a ?? {}) as Record<string, unknown>;
    const kind = String(o.kind ?? "") as AgentActionKind;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!title) continue;

    if (kind === "site_article") {
      const topic = typeof o.topic === "string" ? o.topic.trim() : title;
      actions.push({ kind, ref: null, title, payload: { topic } });
      continue;
    }

    const ref = typeof o.ref === "string" ? o.ref.trim() : "";
    const item = byRef.get(ref);
    if (!item) continue;

    if (kind === "price") {
      const salePrice = Number(o.salePrice);
      if (!Number.isFinite(salePrice) || salePrice <= 0 || !item.listingId) continue;
      actions.push({
        kind,
        ref,
        title,
        payload: { listingId: item.listingId, materialName: item.name, salePrice },
      });
    } else if (kind === "site_product") {
      actions.push({
        kind,
        ref,
        title,
        payload: { materialId: item.materialId, materialName: item.name },
      });
    } else if (kind === "image") {
      actions.push({
        kind,
        ref,
        title,
        payload: { materialId: item.materialId, materialName: item.name },
      });
    } else if (kind === "visibility") {
      if (!item.listingId) continue;
      actions.push({
        kind,
        ref,
        title,
        payload: {
          listingId: item.listingId,
          materialName: item.name,
          note: typeof o.note === "string" ? o.note : "",
        },
      });
    }
  }
  return { summary, actions };
}
