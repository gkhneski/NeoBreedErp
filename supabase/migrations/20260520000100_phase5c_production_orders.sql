-- =============================================================================
-- Phase 5c — Step 1: Production Orders
-- Contract: docs/DATABASE_CONTRACT.md §12.1
-- =============================================================================
-- Adds:
--   * public.production_orders   (per-company production order header)
--   * Triggers:
--       - production_orders_check_parents  (same-company guard for material/recipe,
--                                           material.type='finished',
--                                           recipe.status='published',
--                                           recipe.finished_material_id matches)
--       - production_orders_set_updated_at (shared updated_at trigger)
--
-- Note: production_batches and the planned→in_progress→completed→closed transitions
-- are intentionally deferred to Phase 5c — Step 2 (§12.2). Step 1 only writes
-- 'draft', 'planned', 'cancelled' but the check constraint already permits the
-- full state set so step 2 needs no schema change.
--
-- Idempotent: safe to re-run.
-- =============================================================================

create table if not exists public.production_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  finished_material_id uuid not null references public.materials(id) on delete restrict,
  recipe_id uuid not null references public.recipes(id) on delete restrict,
  planned_quantity numeric(18, 6) not null check (planned_quantity > 0),
  planned_uom text not null,
  status text not null default 'draft'
    check (status in (
      'draft', 'planned', 'in_progress', 'completed', 'closed', 'cancelled'
    )),
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

drop trigger if exists production_orders_set_updated_at on public.production_orders;
create trigger production_orders_set_updated_at
  before update on public.production_orders
  for each row execute function public.set_updated_at();

create index if not exists production_orders_company_id_idx
  on public.production_orders(company_id);
create unique index if not exists production_orders_company_code_unique
  on public.production_orders(company_id, code)
  where deleted_at is null;
create index if not exists production_orders_company_status_idx
  on public.production_orders(company_id, status);
create index if not exists production_orders_recipe_idx
  on public.production_orders(recipe_id);
create index if not exists production_orders_finished_material_idx
  on public.production_orders(finished_material_id);
create index if not exists production_orders_company_start_idx
  on public.production_orders(company_id, planned_start_at);
create index if not exists production_orders_deleted_at_idx
  on public.production_orders(deleted_at);

alter table public.production_orders enable row level security;

drop policy if exists production_orders_select_member on public.production_orders;
create policy production_orders_select_member on public.production_orders
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists production_orders_modify_member on public.production_orders;
create policy production_orders_modify_member on public.production_orders
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

-- Cross-tenant + cross-table guard:
--   * finished_material_id must be same company AND materials.type='finished'
--   * recipe_id must be same company, status='published', and reference the
--     same finished_material_id as this order.
create or replace function public.production_orders_check_parents()
returns trigger
language plpgsql
as $$
declare
  material_company_id uuid;
  material_type text;
  recipe_company_id uuid;
  recipe_status text;
  recipe_finished_material_id uuid;
begin
  select company_id, type
    into material_company_id, material_type
  from public.materials
  where id = new.finished_material_id;

  if material_company_id is null then
    raise exception 'finished_material_id % does not exist', new.finished_material_id
      using errcode = '23503';
  end if;

  if material_company_id <> new.company_id then
    raise exception 'finished_material_id % belongs to a different company',
      new.finished_material_id
      using errcode = '23514';
  end if;

  if material_type <> 'finished' then
    raise exception 'finished_material_id % must be of type finished (got %)',
      new.finished_material_id, material_type
      using errcode = '23514';
  end if;

  select company_id, status, finished_material_id
    into recipe_company_id, recipe_status, recipe_finished_material_id
  from public.recipes
  where id = new.recipe_id;

  if recipe_company_id is null then
    raise exception 'recipe_id % does not exist', new.recipe_id
      using errcode = '23503';
  end if;

  if recipe_company_id <> new.company_id then
    raise exception 'recipe_id % belongs to a different company', new.recipe_id
      using errcode = '23514';
  end if;

  if recipe_status <> 'published' then
    raise exception 'recipe_id % is not published (status=%)',
      new.recipe_id, recipe_status
      using errcode = '23514';
  end if;

  if recipe_finished_material_id <> new.finished_material_id then
    raise exception 'recipe_id % is for a different finished material',
      new.recipe_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists production_orders_check_parents on public.production_orders;
create trigger production_orders_check_parents
  before insert or update of company_id, finished_material_id, recipe_id
  on public.production_orders
  for each row execute function public.production_orders_check_parents();
