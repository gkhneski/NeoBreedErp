"use client";

import {
  CheckCircle2,
  ChevronDown,
  Image as ImageIcon,
  Megaphone,
  MessagesSquare,
  PenLine,
  Play,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

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
export type ProductOption = { id: string; name: string };

type AgentMeta = {
  label: string;
  role: string;
  brain: "OpenAI" | "Claude";
  accent: string; // top bar gradient
  chip: string;
  dot: string;
  bubble: string;
};

const AGENT_META: Record<string, AgentMeta> = {
  ATLAS: {
    label: "ATLAS",
    role: "Operasyon Denetçisi",
    brain: "OpenAI",
    accent: "from-amber-400 to-orange-500",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    dot: "bg-amber-500",
    bubble: "bg-amber-50/70 dark:bg-amber-950/20",
  },
  COSMO: {
    label: "COSMO",
    role: "Pazaryeri & Görünürlük",
    brain: "Claude",
    accent: "from-emerald-400 to-teal-500",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    dot: "bg-emerald-500",
    bubble: "bg-emerald-50/70 dark:bg-emerald-950/20",
  },
  VERA: {
    label: "VERA",
    role: "Satış & Marka",
    brain: "OpenAI",
    accent: "from-sky-400 to-blue-500",
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
    dot: "bg-sky-500",
    bubble: "bg-sky-50/70 dark:bg-sky-950/20",
  },
  Sentez: {
    label: "Sentez",
    role: "Moderatör · Aksiyonlar",
    brain: "Claude",
    accent: "from-violet-400 to-fuchsia-500",
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
    dot: "bg-violet-500",
    bubble: "bg-violet-50/70 dark:bg-violet-950/20",
  },
};

const QUADRANTS = ["ATLAS", "COSMO", "VERA", "Sentez"] as const;
const AGENT_ORDER = ["ATLAS", "COSMO", "VERA"] as const;
const ROUNDS = 2;

function agentKey(agent: string): string {
  return agent.split(" ")[0] ?? agent;
}

const ACTION_ICON: Record<AgentActionKind, typeof Tag> = {
  price: Tag,
  content: PenLine,
  site_product: Sparkles,
  site_article: Megaphone,
  image: ImageIcon,
  visibility: MessagesSquare,
};
const ACTION_LABEL: Record<AgentActionKind, string> = {
  price: "İndirim → onayda Trendyol fiyatı anında değişir",
  content: "Başlık/açıklama → onayda Trendyol içeriği değişir",
  site_product: "Web sayfası taslağı",
  site_article: "Rehber yazısı",
  image: "Trendyol görseli çek",
  visibility: "Görünürlük notu",
};

const tl = (n: number) =>
  `${Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ₺`;

// Typewriter reveal for freshly-arrived messages; historical messages render whole.
function TypingText({ text, animate }: { text: string; animate: boolean }) {
  const [shown, setShown] = useState(animate ? "" : text);

  useEffect(() => {
    if (!animate) {
      setShown(text);
      return;
    }
    setShown("");
    const total = text.length;
    const per = Math.max(1, Math.ceil(total / 90)); // finish in ~1.6s regardless of length
    let i = 0;
    const id = window.setInterval(() => {
      i += per;
      if (i >= total) {
        setShown(text);
        window.clearInterval(id);
      } else {
        setShown(text.slice(0, i));
      }
    }, 18);
    return () => window.clearInterval(id);
  }, [text, animate]);

  const typing = animate && shown.length < text.length;
  return (
    <span className="whitespace-pre-wrap">
      {shown}
      {typing ? (
        <span className="ml-0.5 inline-block animate-pulse text-muted-foreground">▋</span>
      ) : null}
    </span>
  );
}

function AgentPanel({
  agentName,
  meta,
  messages,
  animatedIds,
  isTyping,
}: {
  agentName: string;
  meta: AgentMeta;
  messages: MessageRow[];
  animatedIds: Set<string>;
  isTyping: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, isTyping]);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_2px_16px_-10px_rgba(0,0,0,0.25)]">
      <div className={cn("h-1 bg-gradient-to-r", meta.accent)} />
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", meta.chip)}>
            {meta.label}
          </span>
          <span className="text-[11px] text-muted-foreground">{meta.role}</span>
        </div>
        <span className="flex items-center gap-1.5">
          {isTyping ? (
            <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <span className={cn("h-1.5 w-1.5 animate-ping rounded-full", meta.dot)} />
              yazıyor…
            </span>
          ) : (
            <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-neutral-800">
              {meta.brain}
            </span>
          )}
        </span>
      </header>

      <div
        ref={scrollRef}
        className="flex max-h-[420px] min-h-[260px] flex-1 flex-col gap-2 overflow-y-auto p-3"
      >
        {messages.length === 0 && !isTyping ? (
          <p className="m-auto text-center text-xs text-muted-foreground">
            {meta.label} henüz konuşmadı.
          </p>
        ) : (
          messages.map((m, i) => (
            <div
              key={m.id}
              className={cn(
                "rounded-2xl px-3 py-2 text-sm leading-relaxed",
                meta.bubble,
              )}
            >
              {i > 0 ? (
                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {agentName} · {i + 1}. tur
                </p>
              ) : null}
              <TypingText text={m.content} animate={animatedIds.has(m.id)} />
            </div>
          ))
        )}
        {isTyping ? (
          <div className={cn("flex w-fit gap-1 rounded-2xl px-3 py-2", meta.bubble)}>
            <span className={cn("h-1.5 w-1.5 animate-bounce rounded-full", meta.dot)} />
            <span
              className={cn("h-1.5 w-1.5 animate-bounce rounded-full", meta.dot)}
              style={{ animationDelay: "0.15s" }}
            />
            <span
              className={cn("h-1.5 w-1.5 animate-bounce rounded-full", meta.dot)}
              style={{ animationDelay: "0.3s" }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function BoardroomClient({
  companyId,
  canManage,
  openAiReady,
  session,
  products,
  initialMessages,
  initialActions,
}: {
  companyId: string;
  canManage: boolean;
  openAiReady: boolean;
  session: SessionRow | null;
  products: ProductOption[];
  initialMessages: MessageRow[];
  initialActions: ActionRow[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [actions, setActions] = useState<ActionRow[]>(initialActions);
  const [running, setRunning] = useState(session?.status === "running");
  const [focus, setFocus] = useState("");
  const [productFocus, setProductFocus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  // Messages that arrived live (via realtime) get the typewriter effect.
  const animatedIds = useRef<Set<string>>(new Set());

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
          animatedIds.current.add(m.id);
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

  const briefing = useMemo(
    () => messages.find((m) => m.kind === "briefing") ?? null,
    [messages],
  );

  const byAgent = useMemo(() => {
    const map: Record<string, MessageRow[]> = {};
    for (const m of messages) {
      if (m.kind === "briefing") continue;
      const k = agentKey(m.agent);
      (map[k] ??= []).push(m);
    }
    return map;
  }, [messages]);

  // Who is "typing" right now: derive next speaker from how many turns are in.
  const typingKey = useMemo(() => {
    if (!running) return null;
    const agentCount = messages.filter((m) => m.kind === "agent").length;
    const hasSynth = messages.some((m) => m.kind === "synthesis");
    if (agentCount < AGENT_ORDER.length * ROUNDS) {
      return AGENT_ORDER[agentCount % AGENT_ORDER.length];
    }
    return hasSynth ? null : "Sentez";
  }, [messages, running]);

  function convene() {
    setError(null);
    setMessages([]);
    setActions([]);
    setBriefOpen(false);
    setRunning(true);
    const parts: string[] = [];
    if (productFocus) parts.push(`"${productFocus}" ürününe odaklan.`);
    if (focus.trim()) parts.push(focus.trim());
    const combined = parts.join(" ").slice(0, 200);
    void startBoardroom(companyId, combined).then((res) => {
      setRunning(false);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  const started = messages.length > 0 || running;

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
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center">
          <select
            value={productFocus}
            onChange={(e) => setProductFocus(e.target.value)}
            disabled={running}
            className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm sm:w-56"
          >
            <option value="">Tüm ürünler (genel)</option>
            {products.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
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

      {!started ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          Kurul henüz toplanmadı. Bir ürün seçip (veya genel bırakıp){" "}
          <strong>Kurulu Topla</strong>&apos;ya basın; dört ajan kendi karesinde canlı
          tartışsın.
        </div>
      ) : (
        <>
          {/* Briefing — collapsible so it doesn't flood the screen */}
          {briefing ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <button
                type="button"
                onClick={() => setBriefOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className="h-2 w-2 rounded-full bg-neutral-400" />
                  Durum Brifingi (kurula verilen gerçek veri)
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    briefOpen && "rotate-180",
                  )}
                />
              </button>
              {briefOpen ? (
                <pre className="max-h-72 overflow-y-auto border-t border-border bg-secondary/30 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
                  {briefing.content}
                </pre>
              ) : null}
            </div>
          ) : null}

          {/* 2×2 live agent grid */}
          <div className="grid gap-3 lg:grid-cols-2">
            {QUADRANTS.map((key) => (
              <AgentPanel
                key={key}
                agentName={AGENT_META[key].label}
                meta={AGENT_META[key]}
                messages={byAgent[key] ?? []}
                animatedIds={animatedIds.current}
                isTyping={typingKey === key}
              />
            ))}
          </div>
        </>
      )}

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
  const p = action.payload;
  const salePrice = typeof p.salePrice === "number" ? p.salePrice : Number(p.salePrice);
  const newTitle = typeof p.newTitle === "string" ? p.newTitle : null;
  const description = typeof p.description === "string" ? p.description : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-start sm:justify-between sm:p-4",
        done && "opacity-70",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 space-y-1.5">
          <p className="text-sm font-semibold">{action.title}</p>
          <p className="text-xs text-muted-foreground">
            {ACTION_LABEL[action.kind]}
            {action.ref ? ` · ${action.ref}` : ""}
            {action.status === "applied" && action.result ? ` — ${action.result}` : ""}
            {action.status === "dismissed" ? " — geçildi" : ""}
          </p>

          {action.kind === "price" && Number.isFinite(salePrice) ? (
            <p className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              Yeni fiyat: {tl(salePrice)}
            </p>
          ) : null}

          {action.kind === "content" && (newTitle || description) ? (
            <div className="space-y-1 rounded-lg bg-secondary/60 p-2 text-xs">
              {newTitle ? (
                <p>
                  <span className="font-semibold">Yeni başlık:</span> {newTitle}
                </p>
              ) : null}
              {description ? (
                <p className="text-muted-foreground">{description}</p>
              ) : null}
            </div>
          ) : null}
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
