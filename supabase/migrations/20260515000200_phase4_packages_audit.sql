-- Phase 4 — Super Admin Console support tables
-- packages (plans) and platform_audit_log

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  user_limit integer not null default 5,
  feature_flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists packages_set_updated_at on public.packages;
create trigger packages_set_updated_at
  before update on public.packages
  for each row execute function public.set_updated_at();

alter table public.packages enable row level security;

drop policy if exists packages_select_platform on public.packages;
create policy packages_select_platform on public.packages
  for select
  using (public.is_platform_admin());

drop policy if exists packages_modify_platform on public.packages;
create policy packages_modify_platform on public.packages
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Now the FK from companies.package_id to packages.id (added late so order is safe).
alter table public.companies
  drop constraint if exists companies_package_id_fkey;
alter table public.companies
  add constraint companies_package_id_fkey
  foreign key (package_id) references public.packages(id) on delete set null;

create table if not exists public.platform_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_table text,
  target_id text,
  diff jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_audit_log_actor_idx on public.platform_audit_log(actor_id);
create index if not exists platform_audit_log_created_at_idx on public.platform_audit_log(created_at desc);

alter table public.platform_audit_log enable row level security;

drop policy if exists platform_audit_log_select on public.platform_audit_log;
create policy platform_audit_log_select on public.platform_audit_log
  for select
  using (public.is_platform_admin());

-- Append-only: no update, no delete. Inserts only from platform-admin context.
drop policy if exists platform_audit_log_insert on public.platform_audit_log;
create policy platform_audit_log_insert on public.platform_audit_log
  for insert
  with check (public.is_platform_admin());
