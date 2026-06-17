"use client";

import {
  CheckCircle2,
  Image as ImageIcon,
  Megaphone,
  MessagesSquare,
  Play,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { AgentActionKind, AgentMessageKind } from "@/types/database";

import { applyAgentAction, dismissAgentAction, startBoardroom } from "./actions";

export type SessionRow = {
  id: string;
  status: "running" | "done" | "error";
  focus: string | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};
export type MessageRow = {
  id: string;
  seq: number;
  agent: string;
  model: string | null;
  kind: AgentMessageKind;
  content: string;
  created_at: string;
};
export type ActionRow = {
  id: string;
  kind: AgentActionKind;
  ref: string | null;
  title: string;
  payload: Record<string, unknown>;
  status: "proposed" | "applied" | "dismissed";
  result: string | null;
};

const AGENT_STYLE: Record<string, { ring: string; chip: string }> = {
  ATLAS: { ring: "border-l-amber-500", chip: "bg-amber-100 text-amber-700" },
  COSMO: { ring: "border-l-emerald-500", chip: "bg-emerald-100 text-emerald-700" },
  VERA: { ring: "border-l-sky-500", chip: "bg-sky-100 text-sky-700" },
  Sentez: { ring: "border-l-violet-500", chip: "bg-violet-100 text-violet-700" },
  Brifing: { ring: "border-l-neutral-400", chip: "bg-neutral-100 text-neutral-600" },
};

function agentKey(agent: string): string {
  return agent.split(" ")[0] ?? agent;
}

const ACTION_ICON: Record<AgentActionKind, typeof Tag> = {
  price: Tag,
  site_product: Sparkles,
  site_article: Megaphone,
  image: ImageIcon,
  visibility: MessagesSquare,
};
const ACTION_LABEL: Record<AgentActionKind, string> = {
  price: "Fiyat önerisi → onay kuyruğu",
  site_product: "Web sayfası taslağı",
  site_article: "Rehber yazısı",
  image: "Trendyol görseli çek",
  visibility: "Görünürlük notu",
};

export function BoardroomClient({
  companyId,
  canManage,
  openAiReady,
  session,
  initialMessages,
  initialActions,
}: {
  companyId: string;
  canManage: boolean;
  openAiReady: boolean;
  session: SessionRow | null;
  initialMessages: MessageRow[];
  initialActions: ActionRow[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [actions, setActions] = useState<ActionRow[]>(initialActions);
  const [running, setRunning] = useState(session?.status === "running");
  const [focus, setFocus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Sync server-refreshed props into state (after run / apply / dismiss).
  useEffect(() => {
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const m of initialMessages) byId.set(m.id, m);
      return [...byId.values()].sort((a, b) => a.seq - b.seq);
    });
  }, [initialMessages]);
  useEffect(() => setActions(initialActions), [initialActions]);

  // Live transcript: append agent_messages as the orchestrator writes them.
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
    });
    const channel = supabase
      .channel(`boardroom-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_messages",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const m = payload.new as MessageRow;
          setMessages((prev) =>
            prev.some((x) => x.id === m.id)
              ? prev
              : [...prev, m].sort((a, b) => a.seq - b.seq),
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function convene() {
    setError(null);
    setMessages([]);
    setActions([]);
    setRunning(true);
    void startBoardroom(companyId, focus).then((res) => {
      setRunning(false);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 via-emerald-500 to-violet-600 text-white">
              <MessagesSquare className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">Ajan Kurulu</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            ATLAS, COSMO ve VERA gerçek verinizi tartışır; öncelikli aksiyonları siz
            onaylarsınız. İki ayrı model (Claude + OpenAI) konuşur.
          </p>
        </div>
      </header>

      {!openAiReady ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <code>OPENAI_API_KEY</code> tanımlı değil — şimdilik tüm ajanlar Claude
          üzerinde konuşuyor. Anahtarı ekleyince ATLAS/VERA gerçekten OpenAI olur.
        </p>
      ) : null}

      {canManage ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
          <input
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="Odak (opsiyonel): ör. 'B12 satışları neden düştü?'"
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            disabled={running}
          />
          <Button onClick={convene} disabled={running}>
            <Play className="mr-1.5 h-4 w-4" />
            {running ? "Kurul tartışıyor…" : "Kurulu Topla"}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {/* Transcript */}
      <div className="space-y-3">
        {messages.length === 0 && !running ? (
          <div className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
            Kurul henüz toplanmadı. <strong>Kurulu Topla</strong>&apos;ya basın; ajanlar
            verinizi inceleyip canlı tartışsın.
          </div>
        ) : (
          messages.map((m) => {
            const key = agentKey(m.agent);
            const style = AGENT_STYLE[key] ?? AGENT_STYLE.Brifing;
            const isBrief = m.kind === "briefing";
            const isSynth = m.kind === "synthesis";
            return (
              <div
                key={m.id}
                className={cn(
                  "rounded-2xl border border-l-4 bg-card p-4 shadow-[0_2px_12px_-8px_rgba(0,0,0,0.2)]",
                  style.ring,
                  isSynth && "bg-violet-50/50 dark:bg-violet-950/10",
                )}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-bold",
                      style.chip,
                    )}
                  >
                    {m.agent}
                  </span>
                  {m.model ? (
                    <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-neutral-800">
                      {m.model.startsWith("openai") ? "OpenAI" : "Claude"}
                    </span>
                  ) : null}
                </div>
                <p
                  className={cn(
                    "whitespace-pre-wrap text-sm leading-relaxed",
                    isBrief && "font-mono text-xs text-muted-foreground",
                  )}
                >
                  {m.content}
                </p>
              </div>
            );
          })
        )}
        {running ? (
          <div className="flex items-center gap-2 px-2 text-sm text-muted-foreground">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
            </span>
            Kurul tartışıyor… (canlı akıyor)
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {/* Action list */}
      {actions.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Önerilen Aksiyonlar</h2>
          {actions.map((a) => (
            <ActionItem
              key={a.id}
              companyId={companyId}
              action={a}
              canManage={canManage}
              onError={setError}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function ActionItem({
  companyId,
  action,
  canManage,
  onError,
}: {
  companyId: string;
  action: ActionRow;
  canManage: boolean;
  onError: (m: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const Icon = ACTION_ICON[action.kind];

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    onError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) onError(res.error ?? "İşlem başarısız.");
      router.refresh();
    });
  }

  const done = action.status !== "proposed";

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4",
        done && "opacity-70",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{action.title}</p>
          <p className="text-xs text-muted-foreground">
            {ACTION_LABEL[action.kind]}
            {action.ref ? ` · ${action.ref}` : ""}
            {action.status === "applied" && action.result ? ` — ${action.result}` : ""}
            {action.status === "dismissed" ? " — geçildi" : ""}
          </p>
        </div>
      </div>
      {canManage && !done ? (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => applyAgentAction(companyId, action.id))}
          >
            <CheckCircle2 className="mr-1 h-4 w-4" />
            {pending ? "..." : "Uygula"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => dismissAgentAction(companyId, action.id))}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : action.status === "applied" ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
          <CheckCircle2 className="h-4 w-4" /> Uygulandı
        </span>
      ) : null}
    </div>
  );
}
