-- Phase 11 — Agent Boardroom (AI strateji odası).
-- Çok-ajanlı, çift-model (Claude + OpenAI) bir kurul gerçek ERP verisi üzerine
-- tartışır; owner canlı izler ve önerilen aksiyonları onaylar. Üç tablo:
--   agent_sessions  — bir kurul oturumu
--   agent_messages  — ajan turları (Realtime ile canlı akar)
--   agent_actions   — sentez sonucu önerilen aksiyonlar (owner "Uygula" der)
-- Hepsi STAFF-ONLY (company_users) — admin özelliği; anon/alıcı erişimi yok.

-- 1. agent_sessions ---------------------------------------------------------------

create table if not exists public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  status text not null default 'running'
    check (status in ('running', 'done', 'error')),
  focus text,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists agent_sessions_company_idx
  on public.agent_sessions(company_id, created_at desc);

alter table public.agent_sessions enable row level security;

drop policy if exists agent_sessions_staff_all on public.agent_sessions;
create policy agent_sessions_staff_all on public.agent_sessions
  for all
  to authenticated
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  )
  with check (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

-- 2. agent_messages ---------------------------------------------------------------

create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  seq integer not null,
  agent text not null,
  model text,
  kind text not null default 'agent'
    check (kind in ('briefing', 'agent', 'synthesis')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists agent_messages_session_idx
  on public.agent_messages(session_id, seq);

alter table public.agent_messages enable row level security;

drop policy if exists agent_messages_staff_all on public.agent_messages;
create policy agent_messages_staff_all on public.agent_messages
  for all
  to authenticated
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  )
  with check (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

-- 3. agent_actions ----------------------------------------------------------------

create table if not exists public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  kind text not null
    check (kind in ('price', 'site_product', 'site_article', 'image', 'visibility')),
  ref text,
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'proposed'
    check (status in ('proposed', 'applied', 'dismissed')),
  result text,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  applied_by uuid references auth.users(id) on delete set null
);

create index if not exists agent_actions_session_idx
  on public.agent_actions(session_id, created_at);

alter table public.agent_actions enable row level security;

drop policy if exists agent_actions_staff_all on public.agent_actions;
create policy agent_actions_staff_all on public.agent_actions
  for all
  to authenticated
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  )
  with check (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

-- 4. Realtime — boardroom mesajları ve aksiyonları canlı aksın (phase9b guard'ı).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'agent_messages'
  ) then
    alter publication supabase_realtime add table public.agent_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'agent_actions'
  ) then
    alter publication supabase_realtime add table public.agent_actions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'agent_sessions'
  ) then
    alter publication supabase_realtime add table public.agent_sessions;
  end if;
end $$;
