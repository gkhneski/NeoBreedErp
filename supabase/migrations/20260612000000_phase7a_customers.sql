-- Phase 7a — Customers & customer-owned lots (fason production).
-- Contract: docs/DATABASE_CONTRACT.md §16 (signed off 2026-06-11).

-- 1. customers (structural clone of suppliers) ----------------------------------

create table if not exists public.customers (
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

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create index if not exists customers_company_id_idx on public.customers(company_id);
create index if not exists customers_deleted_at_idx on public.customers(deleted_at);
create unique index if not exists customers_company_code_unique
  on public.customers(company_id, code)
  where deleted_at is null;

alter table public.customers enable row level security;

drop policy if exists customers_select_member on public.customers;
create policy customers_select_member on public.customers
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists customers_modify_member on public.customers;
create policy customers_modify_member on public.customers
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

-- 2. production_orders.customer_id ----------------------------------------------

alter table public.production_orders
  add column if not exists customer_id uuid references public.customers(id) on delete restrict;

create index if not exists production_orders_customer_idx
  on public.production_orders(company_id, customer_id)
  where deleted_at is null;

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
  customer_company_id uuid;
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

  if new.customer_id is not null then
    select company_id into customer_company_id
    from public.customers
    where id = new.customer_id;

    if customer_company_id is null then
      raise exception 'customer_id % does not exist', new.customer_id
        using errcode = '23503';
    end if;

    if customer_company_id <> new.company_id then
      raise exception 'customer_id % belongs to a different company', new.customer_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists production_orders_check_parents on public.production_orders;
create trigger production_orders_check_parents
  before insert or update of company_id, finished_material_id, recipe_id, customer_id
  on public.production_orders
  for each row execute function public.production_orders_check_parents();

-- 3. material_lots.owner_customer_id --------------------------------------------

alter table public.material_lots
  add column if not exists owner_customer_id uuid references public.customers(id) on delete restrict;

create index if not exists material_lots_owner_customer_idx
  on public.material_lots(company_id, owner_customer_id)
  where deleted_at is null;

create or replace function public.material_lots_check_parents()
returns trigger
language plpgsql
as $$
declare
  material_company_id uuid;
  supplier_company_id uuid;
  owner_company_id uuid;
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

  if new.supplier_id is not null then
    select company_id into supplier_company_id
    from public.suppliers
    where id = new.supplier_id;

    if supplier_company_id is null then
      raise exception 'supplier_id % does not exist', new.supplier_id
        using errcode = '23503';
    end if;

    if supplier_company_id <> new.company_id then
      raise exception 'supplier_id % belongs to a different company', new.supplier_id
        using errcode = '23514';
    end if;
  end if;

  if new.owner_customer_id is not null then
    select company_id into owner_company_id
    from public.customers
    where id = new.owner_customer_id;

    if owner_company_id is null then
      raise exception 'owner_customer_id % does not exist', new.owner_customer_id
        using errcode = '23503';
    end if;

    if owner_company_id <> new.company_id then
      raise exception 'owner_customer_id % belongs to a different company',
        new.owner_customer_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists material_lots_check_parents on public.material_lots;
create trigger material_lots_check_parents
  before insert or update of material_id, supplier_id, company_id, owner_customer_id
  on public.material_lots
  for each row execute function public.material_lots_check_parents();

-- 4. cost_snapshots.customer_owned -----------------------------------------------

alter table public.cost_snapshots
  add column if not exists customer_owned boolean not null default false;

-- 5. create_lot_with_receipt: new trailing p_owner_customer_id ------------------

drop function if exists public.create_lot_with_receipt(
  uuid, uuid, uuid, text, date, date, numeric, text, numeric, text, text
);

create or replace function public.create_lot_with_receipt(
  p_company_id  uuid,
  p_material_id uuid,
  p_supplier_id uuid,
  p_lot_number  text,
  p_received_at date,
  p_expiry_date date,
  p_unit_cost   numeric,
  p_currency    text,
  p_quantity    numeric,
  p_notes       text,
  p_movement_notes text,
  p_owner_customer_id uuid default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_lot_id uuid;
  v_user uuid := auth.uid();
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'initial receipt quantity must be > 0'
      using errcode = '23514';
  end if;

  if p_owner_customer_id is not null and p_unit_cost is not null then
    raise exception 'customer-owned lots must not carry a unit cost'
      using errcode = '23514';
  end if;

  insert into public.material_lots (
    company_id, material_id, supplier_id, lot_number,
    received_at, expiry_date, unit_cost, currency, notes,
    owner_customer_id, created_by, updated_by
  )
  values (
    p_company_id, p_material_id, p_supplier_id, p_lot_number,
    coalesce(p_received_at, current_date), p_expiry_date,
    p_unit_cost, p_currency, p_notes,
    p_owner_customer_id, v_user, v_user
  )
  returning id into v_lot_id;

  insert into public.stock_movements (
    company_id, material_id, lot_id, kind, quantity, unit_cost,
    occurred_at, notes, created_by
  )
  values (
    p_company_id, p_material_id, v_lot_id, 'receipt', p_quantity, p_unit_cost,
    coalesce(p_received_at::timestamptz, now()), p_movement_notes,
    v_user
  );

  return v_lot_id;
end;
$$;

grant execute on function public.create_lot_with_receipt(
  uuid, uuid, uuid, text, date, date, numeric, text, numeric, text, text, uuid
) to authenticated;

-- 6. complete_production_batch: customer-owned lots cost exclusion --------------

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

    select id, material_id, company_id, unit_cost, currency, status,
           owner_customer_id
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

    if v_lot.owner_customer_id is not null then
      -- customer-owned material: consumed but cost-free for the factory
      v_line_cost := 0;
    elsif v_lot.unit_cost is not null then
      v_has_cost := true;

      if v_inferred_currency is null then
        v_inferred_currency := v_lot.currency;
      elsif v_lot.currency is not null
            and v_lot.currency <> v_inferred_currency then
        raise exception
          'consumed lots have mixed currencies (% vs %); MVP requires single currency',
          v_inferred_currency, v_lot.currency
          using errcode = '23514';
      end if;

      v_line_cost := (v_consumed_row.quantity * v_lot.unit_cost)::numeric(18, 4);
      v_cost_total := v_cost_total + (v_consumed_row.quantity * v_lot.unit_cost);
    else
      v_line_cost := null;
    end if;

    insert into public.cost_snapshots (
      company_id, production_batch_id, material_id, lot_id,
      quantity, unit_cost, currency, line_cost, customer_owned, created_by
    )
    values (
      p_company_id, p_batch_id, v_lot.material_id, v_lot.id,
      v_consumed_row.quantity, v_lot.unit_cost, v_lot.currency, v_line_cost,
      (v_lot.owner_customer_id is not null),
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

  -- Create output lot for the finished material (never customer-owned)
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
