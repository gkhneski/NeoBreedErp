-- =============================================================================
-- NeoBreed-ERP — initial schema bootstrap
-- Consolidates Phases 2, 3, 4, 5a in a single idempotent migration.
-- Future schema changes go in separate, append-only migration files.
--
-- Section order matters: cross-table policies (e.g. "is member of company")
-- are placed AFTER all referenced tables exist.
-- =============================================================================

-- =============================================================================
-- 0. Shared helpers
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =============================================================================
-- 1. profiles (Phase 2)
-- =============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select
  using (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- 2. platform_admins + is_platform_admin() (Phase 3)
-- =============================================================================

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

-- =============================================================================
-- 3. packages (Phase 4) — defined before companies because companies.package_id FK
-- =============================================================================

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

-- =============================================================================
-- 4. companies (table + indexes + RLS enable). Policies that reference
--    company_users are added AFTER company_users is created (section 6).
-- =============================================================================

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_number text,
  contact_name text,
  contact_email text,
  contact_phone text,
  address text,
  package_id uuid references public.packages(id) on delete set null,
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

-- =============================================================================
-- 5. company_users (table + policies — self-scoped, no cross-table deps)
-- =============================================================================

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

-- =============================================================================
-- 6. companies — cross-table policies (now safe; company_users exists)
-- =============================================================================

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

-- =============================================================================
-- 7. platform_audit_log (Phase 4)
-- =============================================================================

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

drop policy if exists platform_audit_log_insert on public.platform_audit_log;
create policy platform_audit_log_insert on public.platform_audit_log
  for insert
  with check (public.is_platform_admin());

-- =============================================================================
-- 8. materials (Phase 5a — minimal scaffold; expanded in 5b)
-- =============================================================================

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  name text not null,
  type text not null check (type in ('raw','finished')),
  base_uom text not null,
  density numeric(18,6),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

drop trigger if exists materials_set_updated_at on public.materials;
create trigger materials_set_updated_at
  before update on public.materials
  for each row execute function public.set_updated_at();

create index if not exists materials_company_id_idx on public.materials(company_id);
create index if not exists materials_company_type_idx on public.materials(company_id, type);
create index if not exists materials_deleted_at_idx on public.materials(deleted_at);
create unique index if not exists materials_company_code_unique
  on public.materials(company_id, code)
  where deleted_at is null;

alter table public.materials enable row level security;

drop policy if exists materials_select_member on public.materials;
create policy materials_select_member on public.materials
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists materials_modify_member on public.materials;
create policy materials_modify_member on public.materials
  for all
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

-- =============================================================================
-- 9. recipes (Phase 5a)
-- =============================================================================

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  finished_material_id uuid not null references public.materials(id) on delete restrict,
  code text not null,
  name text not null,
  version integer not null default 1,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  mode text not null check (mode in ('quantity','percentage')),
  yield_quantity numeric(18,6) not null check (yield_quantity > 0),
  yield_uom text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

drop trigger if exists recipes_set_updated_at on public.recipes;
create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

create index if not exists recipes_company_id_idx on public.recipes(company_id);
create index if not exists recipes_company_status_idx on public.recipes(company_id, status);
create index if not exists recipes_finished_material_idx on public.recipes(finished_material_id);
create index if not exists recipes_deleted_at_idx on public.recipes(deleted_at);
create unique index if not exists recipes_company_material_version_unique
  on public.recipes(company_id, finished_material_id, version)
  where deleted_at is null;
create unique index if not exists recipes_company_code_unique
  on public.recipes(company_id, code)
  where deleted_at is null;
create unique index if not exists recipes_one_published_per_material
  on public.recipes(company_id, finished_material_id)
  where status = 'published' and deleted_at is null;

create or replace function public.enforce_recipe_finished_material()
returns trigger
language plpgsql
as $$
declare
  m_company uuid;
  m_type text;
begin
  select company_id, type into m_company, m_type
  from public.materials where id = new.finished_material_id;
  if m_company is null then
    raise exception 'recipes.finished_material_id % not found', new.finished_material_id;
  end if;
  if m_company <> new.company_id then
    raise exception 'recipes.finished_material_id must be in same company';
  end if;
  if m_type <> 'finished' then
    raise exception 'recipes.finished_material_id must reference a material of type ''finished''';
  end if;
  return new;
end;
$$;

drop trigger if exists recipes_check_finished_material on public.recipes;
create trigger recipes_check_finished_material
  before insert or update of finished_material_id, company_id on public.recipes
  for each row execute function public.enforce_recipe_finished_material();

alter table public.recipes enable row level security;

drop policy if exists recipes_select_member on public.recipes;
create policy recipes_select_member on public.recipes
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists recipes_modify_member on public.recipes;
create policy recipes_modify_member on public.recipes
  for all
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

-- =============================================================================
-- 10. recipe_items (Phase 5a)
-- =============================================================================

create table if not exists public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  position integer not null,
  quantity numeric(18,6) not null check (quantity > 0),
  uom text not null,
  percentage numeric(8,4),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

drop trigger if exists recipe_items_set_updated_at on public.recipe_items;
create trigger recipe_items_set_updated_at
  before update on public.recipe_items
  for each row execute function public.set_updated_at();

create index if not exists recipe_items_company_id_idx on public.recipe_items(company_id);
create index if not exists recipe_items_material_idx on public.recipe_items(material_id);
create unique index if not exists recipe_items_recipe_position_unique
  on public.recipe_items(recipe_id, position);

create or replace function public.enforce_recipe_item_consistency()
returns trigger
language plpgsql
as $$
declare
  parent_company uuid;
  material_company uuid;
begin
  select company_id into parent_company from public.recipes where id = new.recipe_id;
  if parent_company is null then
    raise exception 'recipe_items: recipe % not found', new.recipe_id;
  end if;
  if parent_company <> new.company_id then
    raise exception 'recipe_items.company_id (%) must equal recipes.company_id (%)', new.company_id, parent_company;
  end if;

  select company_id into material_company from public.materials where id = new.material_id;
  if material_company is null then
    raise exception 'recipe_items: material % not found', new.material_id;
  end if;
  if material_company <> new.company_id then
    raise exception 'recipe_items.material_id must be in same company';
  end if;
  return new;
end;
$$;

drop trigger if exists recipe_items_check_consistency on public.recipe_items;
create trigger recipe_items_check_consistency
  before insert or update of recipe_id, material_id, company_id on public.recipe_items
  for each row execute function public.enforce_recipe_item_consistency();

alter table public.recipe_items enable row level security;

drop policy if exists recipe_items_select_member on public.recipe_items;
create policy recipe_items_select_member on public.recipe_items
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists recipe_items_modify_member on public.recipe_items;
create policy recipe_items_modify_member on public.recipe_items
  for all
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

-- =============================================================================
-- Done.
-- After running this, grant yourself Super Admin access:
--   insert into public.platform_admins (user_id) values ('<your-auth-uid>');
-- =============================================================================
