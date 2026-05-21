-- =============================================================================
-- Phase 5e — Basic Costing (material cost roll-up per batch)
-- Contract: docs/DATABASE_CONTRACT.md §14
-- =============================================================================
-- Adds:
--   * public.cost_snapshots                    (per-batch x lot rollup line)
--   * Triggers:
--       - cost_snapshots_check_parents         (same-company guard; lot/material
--                                               consistency)
--       - cost_snapshots_block_mutations       (append-only: no UPDATE/DELETE)
--   * RPC re-creation:
--       - complete_production_batch(...)       (now also writes cost_snapshots
--                                               rows in the same transaction)
-- Idempotent: safe to re-run.
-- =============================================================================

-- 1. cost_snapshots -------------------------------------------------------------

create table if not exists public.cost_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  production_batch_id uuid not null
    references public.production_batches(id) on delete restrict,
  material_id uuid not null
    references public.materials(id) on delete restrict,
  lot_id uuid not null
    references public.material_lots(id) on delete restrict,
  quantity numeric(18, 6) not null check (quantity > 0),
  unit_cost numeric(18, 4),
  currency text,
  line_cost numeric(18, 4),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists cost_snapshots_company_id_idx
  on public.cost_snapshots(company_id);
create index if not exists cost_snapshots_batch_idx
  on public.cost_snapshots(production_batch_id);
create index if not exists cost_snapshots_material_idx
  on public.cost_snapshots(company_id, material_id);
create index if not exists cost_snapshots_lot_idx
  on public.cost_snapshots(lot_id);

alter table public.cost_snapshots enable row level security;

drop policy if exists cost_snapshots_select_member on public.cost_snapshots;
create policy cost_snapshots_select_member on public.cost_snapshots
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists cost_snapshots_modify_member on public.cost_snapshots;
create policy cost_snapshots_modify_member on public.cost_snapshots
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

-- Parent-consistency: batch, material, lot must all belong to the same company;
-- lot.material_id must equal this row's material_id.
create or replace function public.cost_snapshots_check_parents()
returns trigger
language plpgsql
as $$
declare
  v_batch_company uuid;
  v_material_company uuid;
  v_lot_company uuid;
  v_lot_material uuid;
begin
  select company_id into v_batch_company
  from public.production_batches
  where id = new.production_batch_id;

  if v_batch_company is null then
    raise exception 'production_batch_id % does not exist', new.production_batch_id
      using errcode = '23503';
  end if;

  if v_batch_company <> new.company_id then
    raise exception 'production_batch_id % belongs to a different company',
      new.production_batch_id
      using errcode = '23514';
  end if;

  select company_id into v_material_company
  from public.materials
  where id = new.material_id;

  if v_material_company is null then
    raise exception 'material_id % does not exist', new.material_id
      using errcode = '23503';
  end if;

  if v_material_company <> new.company_id then
    raise exception 'material_id % belongs to a different company', new.material_id
      using errcode = '23514';
  end if;

  select company_id, material_id
    into v_lot_company, v_lot_material
  from public.material_lots
  where id = new.lot_id;

  if v_lot_company is null then
    raise exception 'lot_id % does not exist', new.lot_id
      using errcode = '23503';
  end if;

  if v_lot_company <> new.company_id then
    raise exception 'lot_id % belongs to a different company', new.lot_id
      using errcode = '23514';
  end if;

  if v_lot_material <> new.material_id then
    raise exception 'lot_id % belongs to a different material', new.lot_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists cost_snapshots_check_parents on public.cost_snapshots;
create trigger cost_snapshots_check_parents
  before insert or update of
    company_id, production_batch_id, material_id, lot_id
  on public.cost_snapshots
  for each row execute function public.cost_snapshots_check_parents();

-- Append-only: no UPDATE / DELETE on snapshot rows.
create or replace function public.cost_snapshots_block_mutations()
returns trigger
language plpgsql
as $$
begin
  raise exception 'cost_snapshots is append-only; correct via a new stock adjustment'
    using errcode = '42501';
end;
$$;

drop trigger if exists cost_snapshots_block_update on public.cost_snapshots;
create trigger cost_snapshots_block_update
  before update on public.cost_snapshots
  for each row execute function public.cost_snapshots_block_mutations();

drop trigger if exists cost_snapshots_block_delete on public.cost_snapshots;
create trigger cost_snapshots_block_delete
  before delete on public.cost_snapshots
  for each row execute function public.cost_snapshots_block_mutations();

-- 2. complete_production_batch — re-created to also write cost_snapshots -------

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
  v_line_cost numeric(18, 4);
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

  -- Issue consumed lots + write cost_snapshots rows
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

      v_line_cost := (v_consumed_row.quantity * v_lot.unit_cost)::numeric(18, 4);
      v_cost_total := v_cost_total + (v_consumed_row.quantity * v_lot.unit_cost);
    else
      v_line_cost := null;
    end if;

    insert into public.cost_snapshots (
      company_id, production_batch_id, material_id, lot_id,
      quantity, unit_cost, currency, line_cost, created_by
    )
    values (
      p_company_id, p_batch_id, v_lot.material_id, v_lot.id,
      v_consumed_row.quantity, v_lot.unit_cost, v_lot.currency, v_line_cost,
      v_user
    );
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
