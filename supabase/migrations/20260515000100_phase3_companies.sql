-- Phase 3 — Multi-tenant foundation
-- companies, company_users, platform_admins

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

drop policy if exists platform_admins_select_self on public.platform_admins;
create policy platform_admins_select_self on public.platform_admins
  for select
  using (user_id = auth.uid());

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_number text,
  contact_name text,
  contact_email text,
  contact_phone text,
  address text,
  package_id uuid,
  status text not null default 'active' check (status in ('active','suspended','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

create index if not exists companies_status_idx on public.companies(status);
create index if not exists companies_deleted_at_idx on public.companies(deleted_at);

alter table public.companies enable row level security;

drop policy if exists companies_select_platform on public.companies;
create policy companies_select_platform on public.companies
  for select
  using (public.is_platform_admin());

drop policy if exists companies_select_member on public.companies;
create policy companies_select_member on public.companies
  for select
  using (
    id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists companies_modify_platform on public.companies;
create policy companies_modify_platform on public.companies
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create table if not exists public.company_users (
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  role text not null check (role in ('company_admin','company_user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, company_id)
);

drop trigger if exists company_users_set_updated_at on public.company_users;
create trigger company_users_set_updated_at
  before update on public.company_users
  for each row execute function public.set_updated_at();

create index if not exists company_users_company_id_idx on public.company_users(company_id);

alter table public.company_users enable row level security;

drop policy if exists company_users_select_self on public.company_users;
create policy company_users_select_self on public.company_users
  for select
  using (user_id = auth.uid());

drop policy if exists company_users_select_platform on public.company_users;
create policy company_users_select_platform on public.company_users
  for select
  using (public.is_platform_admin());

drop policy if exists company_users_modify_platform on public.company_users;
create policy company_users_modify_platform on public.company_users
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
