"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { runBoardroom } from "@/lib/agents/orchestrator";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { BOARDROOM_ROLES, companyModulePath } from "@/types/roles";

import { pullTrendyolImage } from "../products/actions";
import { proposeMarketingPrice } from "../marketplace/cosmo-marketing-actions";
import { generateArticleDraft, generateProductPageDraft } from "../site/actions";

export type StartResult = { ok: true; sessionId: string } | { ok: false; error: string };
export type ActionResult = { ok: true; note?: string } | { ok: false; error: string };

// Kurulu topla: gerçek ERP brifingi üzerine çok-ajanlı tartışma + aksiyon listesi.
export async function startBoardroom(
  companyIdInput: string,
  focusInput: string,
): Promise<StartResult> {
  const parsed = z
    .object({ company: z.string().uuid(), focus: z.string().max(200) })
    .safeParse({ company: companyIdInput, focus: focusInput });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const { ctx, companyId } = await requireCompanyRole(parsed.data.company, BOARDROOM_ROLES);

  try {
    const { sessionId } = await runBoardroom(
      companyId,
      parsed.data.focus.trim() || null,
      ctx.userId,
    );
    revalidatePath(companyModulePath(companyId, "boardroom"));
    return { ok: true, sessionId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Kurul çalıştırılamadı." };
  }
}

const idSchema = z.object({ company: z.string().uuid(), id: z.string().uuid() });

// "Uygula": önerilen aksiyonu mevcut güvenli akışa bağla (owner onayı).
export async function applyAgentAction(
  companyIdInput: string,
  actionIdInput: string,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse({ company: companyIdInput, id: actionIdInput });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const { ctx, companyId } = await requireCompanyRole(parsed.data.company, BOARDROOM_ROLES);
  const service = createServiceRoleClient();

  const { data: action } = await service
    .from("agent_actions")
    .select("id, kind, payload, status")
    .eq("id", parsed.data.id)
    .eq("company_id", companyId)
    .maybeSingle<{
      id: string;
      kind: "price" | "site_product" | "site_article" | "image" | "visibility";
      payload: Record<string, unknown>;
      status: string;
    }>();
  if (!action) return { ok: false, error: "Aksiyon bulunamadı." };
  if (action.status !== "proposed") return { ok: false, error: "Bu aksiyon zaten işlendi." };

  const p = action.payload;
  let result: { ok: boolean; error?: string };
  let note = "Uygulandı.";

  switch (action.kind) {
    case "price": {
      const r = await proposeMarketingPrice(
        companyId,
        String(p.listingId),
        Number(p.salePrice),
      );
      result = r;
      note = "Fiyat önerisi onay kuyruğuna eklendi.";
      break;
    }
    case "site_product": {
      const r = await generateProductPageDraft(companyId, String(p.materialId));
      result = r;
      note = "Web sayfası taslağı oluşturuldu (Web Sitesi modülünden yayınlayın).";
      break;
    }
    case "site_article": {
      const r = await generateArticleDraft(companyId, String(p.topic));
      result = r;
      note = "Rehber yazısı taslağı oluşturuldu.";
      break;
    }
    case "image": {
      const r = await pullTrendyolImage(companyId, String(p.materialId));
      result = r;
      note = "Trendyol görseli çekildi.";
      break;
    }
    case "visibility": {
      // v1: bilgilendirici — mutasyon yok, not olarak işaretlenir.
      result = { ok: true };
      note = "Görünürlük notu kaydedildi. Detay için Pazaryeri → COSMO.";
      break;
    }
    default:
      result = { ok: false, error: "Bilinmeyen aksiyon türü." };
  }

  if (!result.ok) return { ok: false, error: result.error ?? "Aksiyon uygulanamadı." };

  await service
    .from("agent_actions")
    .update({
      status: "applied",
      result: note,
      applied_at: new Date().toISOString(),
      applied_by: ctx.userId,
    })
    .eq("id", action.id)
    .eq("company_id", companyId);

  revalidatePath(companyModulePath(companyId, "boardroom"));
  return { ok: true, note };
}

export async function dismissAgentAction(
  companyIdInput: string,
  actionIdInput: string,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse({ company: companyIdInput, id: actionIdInput });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const { companyId } = await requireCompanyRole(parsed.data.company, BOARDROOM_ROLES);
  const service = createServiceRoleClient();
  const { error } = await service
    .from("agent_actions")
    .update({ status: "dismissed" })
    .eq("id", parsed.data.id)
    .eq("company_id", companyId)
    .eq("status", "proposed");
  if (error) return { ok: false, error: error.message };
  revalidatePath(companyModulePath(companyId, "boardroom"));
  return { ok: true };
}
