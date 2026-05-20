-- =============================================================================
-- Phase 5b — Step 1: Suppliers + Materials expansion
-- Contract: docs/DATABASE_CONTRACT.md §10
-- =============================================================================
-- Adds:
--   * public.suppliers (per-company)
--   * materials.default_supplier_id, allergen_flags, storage_conditions,
--     regulatory_notes
--   * cross-tenant guard trigger ensuring default_supplier_id belongs to the
--     same company_id as the material row
-- Idempotent: safe to re-run.
-- =============================================================================

-- 1. suppliers table -----------------------------------------------------------

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  name text not null,
  tax_number text,
  email text,
  phone text,
  address text,
  country text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

create index if not exists suppliers_company_id_idx on public.suppliers(company_id);
create index if not exists suppliers_deleted_at_idx on public.suppliers(deleted_at);
create unique index if not exists suppliers_company_code_unique
  on public.suppliers(company_id, code)
  where deleted_at is null;

alter table public.suppliers enable row level security;

drop policy if exists suppliers_select_member on public.suppliers;
create policy suppliers_select_member on public.suppliers
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists suppliers_modify_member on public.suppliers;
create policy suppliers_modify_member on public.suppliers
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

-- 2. materials column additions ------------------------------------------------

alter table public.materials
  add column if not exists default_supplier_id uuid
    references public.suppliers(id) on delete set null;

alter table public.materials
  add column if not exists allergen_flags jsonb not null default '[]'::jsonb;

alter table public.materials
  add column if not exists storage_conditions text;

alter table public.materials
  add column if not exists regulatory_notes text;

create index if not exists materials_supplier_idx
  on public.materials(company_id, default_supplier_id);

-- 3. Cross-tenant guard: supplier must belong to material's company_id ---------

create or replace function public.materials_check_supplier_company()
returns trigger
language plpgsql
as $$
declare
  supplier_company_id uuid;
begin
  if new.default_supplier_id is null then
    return new;
  end if;

  select company_id into supplier_company_id
  from public.suppliers
  where id = new.default_supplier_id;

  if supplier_company_id is null then
    raise exception 'default_supplier_id % does not exist', new.default_supplier_id
      using errcode = '23503';
  end if;

  if supplier_company_id <> new.company_id then
    raise exception 'default_supplier_id % belongs to a different company',
      new.default_supplier_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists materials_check_supplier_company on public.materials;
create trigger materials_check_supplier_company
  before insert or update of default_supplier_id, company_id
  on public.materials
  for each row execute function public.materials_check_supplier_company();
