-- =============================================================================
-- Phase 5c — Step 2: Production Batches + execution RPCs
-- Contract: docs/DATABASE_CONTRACT.md §12.2
-- =============================================================================
-- Adds:
--   * public.production_batches              (per-company batch row)
--   * public.stock_movements.batch_id        (nullable FK + index)
--   * Triggers:
--       - production_batches_check_parents   (same-company guard for order,
--                                             recipe, output_lot; output_lot's
--                                             material must equal order's
--                                             finished material)
--       - production_batches_set_updated_at  (shared)
--       - stock_movements_check_parents      (re-created to also validate
--                                             batch_id same-company)
--   * RPCs (security invoker, RLS applies):
--       - start_production_order(...)        (planned -> in_progress)
--       - complete_production_batch(...)     (in_progress -> completed,
--                                             issues consumed lots, creates
--                                             output lot + receipt, snapshots
--                                             cost)
-- Idempotent: safe to re-run.
-- =============================================================================

-- 1. production_batches ---------------------------------------------------------

create table if not exists public.production_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  production_order_id uuid not null
    references public.production_orders(id) on delete restrict,
  batch_number text not null,
  recipe_id uuid not null references public.recipes(id) on delete restrict,
  output_lot_id uuid references public.material_lots(id) on delete restrict,
  planned_quantity numeric(18, 6) not null check (planned_quantity > 0),
  actual_quantity numeric(18, 6)
    check (actual_quantity is null or actual_quantity > 0),
  uom text not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'closed', 'cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  cost_total numeric(18, 4),
  cost_currency text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

drop trigger if exists production_batches_set_updated_at on public.production_batches;
create trigger production_batches_set_updated_at
  before update on public.production_batches
  for each row execute function public.set_updated_at();

create index if not exists production_batches_company_id_idx
  on public.production_batches(company_id);
create unique index if not exists production_batches_company_number_unique
  on public.production_batches(company_id, batch_number)
  where deleted_at is null;
create index if not exists production_batches_order_idx
  on public.production_batches(production_order_id);
create index if not exists production_batches_company_status_idx
  on public.production_batches(company_id, status);
create index if not exists production_batches_output_lot_idx
  on public.production_batches(output_lot_id);
create index if not exists production_batches_deleted_at_idx
  on public.production_batches(deleted_at);

alter table public.production_batches enable row level security;

drop policy if exists production_batches_select_member on public.production_batches;
create policy production_batches_select_member on public.production_batches
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists production_batches_modify_member on public.production_batches;
create policy production_batches_modify_member on public.production_batches
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

create or replace function public.production_batches_check_parents()
returns trigger
language plpgsql
as $$
declare
  v_order_company uuid;
  v_order_material uuid;
  v_recipe_company uuid;
  v_lot_company uuid;
  v_lot_material uuid;
begin
  select company_id, finished_material_id
    into v_order_company, v_order_material
  from public.production_orders
  where id = new.production_order_id;

  if v_order_company is null then
    raise exception 'production_order_id % does not exist', new.production_order_id
      using errcode = '23503';
  end if;

  if v_order_company <> new.company_id then
    raise exception 'production_order_id % belongs to a different company',
      new.production_order_id
      using errcode = '23514';
  end if;

  select company_id into v_recipe_company
  from public.recipes
  where id = new.recipe_id;

  if v_recipe_company is null then
    raise exception 'recipe_id % does not exist', new.recipe_id
      using errcode = '23503';
  end if;

  if v_recipe_company <> new.company_id then
    raise exception 'recipe_id % belongs to a different company', new.recipe_id
      using errcode = '23514';
  end if;

  if new.output_lot_id is not null then
    select company_id, material_id
      into v_lot_company, v_lot_material
    from public.material_lots
    where id = new.output_lot_id;

    if v_lot_company is null then
      raise exception 'output_lot_id % does not exist', new.output_lot_id
        using errcode = '23503';
    end if;

    if v_lot_company <> new.company_id then
      raise exception 'output_lot_id % belongs to a different company',
        new.output_lot_id
        using errcode = '23514';
    end if;

    if v_lot_material <> v_order_material then
      raise exception 'output_lot_id % material does not match order finished material',
        new.output_lot_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists production_batches_check_parents on public.production_batches;
create trigger production_batches_check_parents
  before insert or update of
    company_id, production_order_id, recipe_id, output_lot_id
  on public.production_batches
  for each row execute function public.production_batches_check_parents();

-- 2. stock_movements.batch_id --------------------------------------------------

alter table public.stock_movements
  add column if not exists batch_id uuid
    references public.production_batches(id) on delete restrict;

create index if not exists stock_movements_batch_idx
  on public.stock_movements(batch_id);

-- Re-create check_parents trigger to ALSO validate batch_id same-company.
create or replace function public.stock_movements_check_parents()
returns trigger
language plpgsql
as $$
declare
  material_company_id uuid;
  lot_company_id uuid;
  lot_material_id uuid;
  batch_company_id uuid;
begin
  select company_id into material_company_id
  from public.materials
  where id = new.material_id;

  if material_company_id is null then
    raise exception 'material_id % does not exist', new.material_id
      using errcode = '23503';
  end if;

  if material_company_id <> new.company_id then
    raise exception 'material_id % belongs to a different company', new.material_id
      using errcode = '23514';
  end if;

  select company_id, material_id
    into lot_company_id, lot_material_id
  from public.material_lots
  where id = new.lot_id;

  if lot_company_id is null then
    raise exception 'lot_id % does not exist', new.lot_id
      using errcode = '23503';
  end if;

  if lot_company_id <> new.company_id then
    raise exception 'lot_id % belongs to a different company', new.lot_id
      using errcode = '23514';
  end if;

  if lot_material_id <> new.material_id then
    raise exception 'lot_id % belongs to a different material', new.lot_id
      using errcode = '23514';
  end if;

  if new.batch_id is not null then
    select company_id into batch_company_id
    from public.production_batches
    where id = new.batch_id;

    if batch_company_id is null then
      raise exception 'batch_id % does not exist', new.batch_id
        using errcode = '23503';
    end if;

    if batch_company_id <> new.company_id then
      raise exception 'batch_id % belongs to a different company', new.batch_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

-- 3. RPC: start_production_order -----------------------------------------------

create or replace function public.start_production_order(
  p_company_id uuid,
  p_order_id uuid,
  p_batch_number text
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_order record;
  v_batch_id uuid;
  v_user uuid := auth.uid();
begin
  if p_batch_number is null or btrim(p_batch_number) = '' then
    raise exception 'batch_number is required' using errcode = '23514';
  end if;

  select id, company_id, status, recipe_id, planned_quantity, planned_uom,
         finished_material_id
    into v_order
  from public.production_orders
  where id = p_order_id
    and company_id = p_company_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'production order % not found in this company', p_order_id
      using errcode = '23503';
  end if;

  if v_order.status <> 'planned' then
    raise exception 'order must be planned to start (currently: %)', v_order.status
      using errcode = '23514';
  end if;

  insert into public.production_batches (
    company_id, production_order_id, batch_number, recipe_id,
    planned_quantity, uom, status, started_at,
    created_by, updated_by
  )
  values (
    p_company_id, v_order.id, p_batch_number, v_order.recipe_id,
    v_order.planned_quantity, v_order.planned_uom, 'in_progress', now(),
    v_user, v_user
  )
  returning id into v_batch_id;

  update public.production_orders
     set status = 'in_progress',
         started_at = now(),
         updated_by = v_user
   where id = v_order.id;

  return v_batch_id;
end;
$$;

grant execute on function public.start_production_order(uuid, uuid, text)
  to authenticated;

-- 4. RPC: complete_production_batch --------------------------------------------

create or replace function public.complete_production_batch(
  p_company_id uuid,
  p_batch_id uuid,
  p_actual_quantity numeric,
  p_output_lot_number text,
  p_output_expiry_date date,
  p_consumed jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_batch record;
  v_order record;
  v_user uuid := auth.uid();
  v_consumed_row record;
  v_lot record;
  v_signed_qty numeric;
  v_cost_total numeric := 0;
  v_has_cost boolean := false;
  v_inferred_currency text;
  v_first_lot boolean := true;
  v_output_lot_id uuid;
  v_output_unit_cost numeric;
  v_cost_total_final numeric(18, 4);
  v_cost_currency text;
begin
  if p_actual_quantity is null or p_actual_quantity <= 0 then
    raise exception 'actual_quantity must be > 0' using errcode = '23514';
  end if;

  if p_output_lot_number is null or btrim(p_output_lot_number) = '' then
    raise exception 'output_lot_number is required' using errcode = '23514';
  end if;

  if p_consumed is null or jsonb_typeof(p_consumed) <> 'array'
     or jsonb_array_length(p_consumed) = 0 then
    raise exception 'p_consumed must be a non-empty array' using errcode = '23514';
  end if;

  -- Lock + load batch
  select id, company_id, production_order_id, batch_number, recipe_id,
         planned_quantity, uom, status
    into v_batch
  from public.production_batches
  where id = p_batch_id
    and company_id = p_company_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'batch % not found in this company', p_batch_id
      using errcode = '23503';
  end if;

  if v_batch.status <> 'in_progress' then
    raise exception 'batch must be in_progress to complete (currently: %)',
      v_batch.status
      using errcode = '23514';
  end if;

  -- Lock + load order
  select id, company_id, status, finished_material_id
    into v_order
  from public.production_orders
  where id = v_batch.production_order_id
    and company_id = p_company_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'order for batch % not found', p_batch_id using errcode = '23503';
  end if;

  if v_order.status <> 'in_progress' then
    raise exception 'order must be in_progress (currently: %)', v_order.status
      using errcode = '23514';
  end if;

  -- Issue consumed lots
  for v_consumed_row in
    select * from jsonb_to_recordset(p_consumed)
      as x(lot_id uuid, quantity numeric)
  loop
    if v_consumed_row.lot_id is null then
      raise exception 'consumed entry missing lot_id' using errcode = '23514';
    end if;

    if v_consumed_row.quantity is null or v_consumed_row.quantity <= 0 then
      raise exception 'consumed quantity must be > 0 for lot %',
        v_consumed_row.lot_id
        using errcode = '23514';
    end if;

    select id, material_id, company_id, unit_cost, currency, status
      into v_lot
    from public.material_lots
    where id = v_consumed_row.lot_id
      and deleted_at is null;

    if not found then
      raise exception 'lot % does not exist', v_consumed_row.lot_id
        using errcode = '23503';
    end if;

    if v_lot.company_id <> p_company_id then
      raise exception 'lot % belongs to a different company', v_consumed_row.lot_id
        using errcode = '23514';
    end if;

    if v_lot.status <> 'released' then
      raise exception 'lot % is not released (status: %); cannot consume',
        v_consumed_row.lot_id, v_lot.status
        using errcode = '23514';
    end if;

    v_signed_qty := -1 * v_consumed_row.quantity;

    insert into public.stock_movements (
      company_id, material_id, lot_id, batch_id, kind, quantity,
      occurred_at, notes, created_by
    )
    values (
      p_company_id, v_lot.material_id, v_lot.id, p_batch_id,
      'issue', v_signed_qty,
      now(), 'production batch consumption', v_user
    );

    if v_lot.unit_cost is not null then
      v_has_cost := true;

      if v_first_lot then
        v_inferred_currency := v_lot.currency;
        v_first_lot := false;
      else
        if v_inferred_currency is null then
          v_inferred_currency := v_lot.currency;
        elsif v_lot.currency is not null
              and v_lot.currency <> v_inferred_currency then
          raise exception
            'consumed lots have mixed currencies (% vs %); MVP requires single currency',
            v_inferred_currency, v_lot.currency
            using errcode = '23514';
        end if;
      end if;

      v_cost_total := v_cost_total + (v_consumed_row.quantity * v_lot.unit_cost);
    end if;
  end loop;

  if v_has_cost then
    v_cost_total_final := v_cost_total;
    v_cost_currency := v_inferred_currency;
    v_output_unit_cost := v_cost_total / p_actual_quantity;
  else
    v_cost_total_final := null;
    v_cost_currency := null;
    v_output_unit_cost := null;
  end if;

  -- Create output lot for the finished material
  insert into public.material_lots (
    company_id, material_id, supplier_id, lot_number,
    received_at, expiry_date, unit_cost, currency, status,
    notes, created_by, updated_by
  )
  values (
    p_company_id, v_order.finished_material_id, null, p_output_lot_number,
    current_date, p_output_expiry_date, v_output_unit_cost, v_cost_currency,
    'quarantine',
    'output of production batch ' || v_batch.batch_number, v_user, v_user
  )
  returning id into v_output_lot_id;

  -- Receipt for the output lot
  insert into public.stock_movements (
    company_id, material_id, lot_id, batch_id, kind, quantity, unit_cost,
    occurred_at, notes, created_by
  )
  values (
    p_company_id, v_order.finished_material_id, v_output_lot_id, p_batch_id,
    'receipt', p_actual_quantity, v_output_unit_cost,
    now(), 'production batch output', v_user
  );

  update public.production_batches
     set status = 'completed',
         actual_quantity = p_actual_quantity,
         output_lot_id = v_output_lot_id,
         completed_at = now(),
         cost_total = v_cost_total_final,
         cost_currency = v_cost_currency,
         updated_by = v_user
   where id = p_batch_id;

  update public.production_orders
     set status = 'completed',
         completed_at = now(),
         updated_by = v_user
   where id = v_order.id;

  return v_output_lot_id;
end;
$$;

grant execute on function public.complete_production_batch(
  uuid, uuid, numeric, text, date, jsonb
) to authenticated;
