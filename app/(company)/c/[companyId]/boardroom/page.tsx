import { requireModuleAccess } from "@/lib/auth";
import { openAiConfigured } from "@/lib/agents/models";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { BOARDROOM_ROLES, canWriteCompanyData } from "@/types/roles";

import {
  BoardroomClient,
  type ActionRow,
  type MessageRow,
  type ProductOption,
  type SessionRow,
} from "./boardroom-client";

// Multi-agent boardroom runs ~30-90s server-side while the owner watches via Realtime.
export const maxDuration = 300;

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function BoardroomPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireModuleAccess(routeCompanyId, "boardroom");
  const supabase = await createServerSupabaseClient();

  const [{ data: session }, { data: productRows }] = await Promise.all([
    supabase
      .from("agent_sessions")
      .select("id, status, focus, error, created_at, finished_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<SessionRow>(),
    supabase
      .from("materials")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("type", "finished")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .returns<ProductOption[]>(),
  ]);
  const products: ProductOption[] = productRows ?? [];

  let messages: MessageRow[] = [];
  let actions: ActionRow[] = [];
  if (session) {
    const [{ data: msgs }, { data: acts }] = await Promise.all([
      supabase
        .from("agent_messages")
        .select("id, seq, agent, model, kind, content, created_at")
        .eq("company_id", companyId)
        .eq("session_id", session.id)
        .order("seq", { ascending: true })
        .returns<MessageRow[]>(),
      supabase
        .from("agent_actions")
        .select("id, kind, ref, title, payload, status, result")
        .eq("company_id", companyId)
        .eq("session_id", session.id)
        .order("created_at", { ascending: true })
        .returns<ActionRow[]>(),
    ]);
    messages = msgs ?? [];
    actions = acts ?? [];
  }

  return (
    <BoardroomClient
      companyId={companyId}
      canManage={canWriteCompanyData(role, BOARDROOM_ROLES)}
      openAiReady={openAiConfigured()}
      session={session ?? null}
      products={products}
      initialMessages={messages}
      initialActions={actions}
    />
  );
}
