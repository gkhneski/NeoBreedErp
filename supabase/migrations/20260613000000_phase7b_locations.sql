-- Phase 7b — Locations & whole-lot transfer.
-- Contract: docs/DATABASE_CONTRACT.md §17 (signed off 2026-06-11).

-- 1. locations -------------------------------------------------------------------

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  name text not null,
  is_default boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

drop trigger if exists locations_set_updated_at on public.locations;
create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function public.set_updated_at();

create index if not exists locations_company_id_idx on public.locations(company_id);
create unique index if not exists locations_company_code_unique
  on public.locations(company_id, code)
  where deleted_at is null;
create unique index if not exists locations_company_default_unique
  on public.locations(company_id)
  where is_default and deleted_at is null;

alter table public.locations enable row level security;

drop policy if exists locations_select_member on public.locations;
create policy locations_select_member on public.locations
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists locations_modify_member on public.locations;
create policy locations_modify_member on public.locations
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

-- Backfill: every existing company gets a default location.
insert into public.locations (company_id, code, name, is_default)
select c.id, 'ANA', 'Ana Depo', true
from public.companies c
where not exists (
  select 1 from public.locations l
  where l.company_id = c.id and l.is_default and l.deleted_at is null
);

-- Lazy default for companies created after this migration.
create or replace function public.ensure_default_location(p_company_id uuid)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.locations
  where company_id = p_company_id and is_default and deleted_at is null
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  begin
    insert into public.locations (company_id, code, name, is_default, created_by, updated_by)
    values (p_company_id, 'ANA', 'Ana Depo', true, auth.uid(), auth.uid())
    returning id into v_id;
  exception when unique_violation then
    select id into v_id
    from public.locations
    where company_id = p_company_id and is_default and deleted_at is null
    limit 1;
  end;

  return v_id;
end;
$$;

grant execute on function public.ensure_default_location(uuid) to authenticated;

-- 2. material_lots.location_id ---------------------------------------------------

alter table public.material_lots
  add column if not exists location_id uuid references public.locations(id) on delete restrict;

update public.material_lots ml
   set location_id = l.id
  from public.locations l
 where ml.location_id is null
   and l.company_id = ml.company_id
   and l.is_default
   and l.deleted_at is null;

create index if not exists material_lots_company_location_idx
  on public.material_lots(company_id, location_id)
  where deleted_at is null;

create or replace function public.material_lots_check_parents()
returns trigger
language plpgsql
as $$
declare
  material_company_id uuid;
  supplier_company_id uuid;
  owner_company_id uuid;
  location_company_id uuid;
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

  if new.location_id is not null then
    select company_id into location_company_id
    from public.locations
    where id = new.location_id;

    if location_company_id is null then
      raise exception 'location_id % does not exist', new.location_id
        using errcode = '23503';
    end if;

    if location_company_id <> new.company_id then
      raise exception 'location_id % belongs to a different company',
        new.location_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists material_lots_check_parents on public.material_lots;
create trigger material_lots_check_parents
  before insert or update of material_id, supplier_id, company_id, owner_customer_id, location_id
  on public.material_lots
  for each row execute function public.material_lots_check_parents();

-- 3. stock_movements: transfer kind + location columns ---------------------------

alter table public.stock_movements
  add column if not exists from_location_id uuid references public.locations(id) on delete restrict;
alter table public.stock_movements
  add column if not exists to_location_id uuid references public.locations(id) on delete restrict;

alter table public.stock_movements
  drop constraint if exists stock_movements_kind_check;
alter table public.stock_movements
  add constraint stock_movements_kind_check
  check (kind in ('receipt', 'issue', 'adjustment', 'transfer'));

alter table public.stock_movements
  drop constraint if exists stock_movements_signed_qty;
alter table public.stock_movements
  add constraint stock_movements_signed_qty check (
    (kind = 'receipt'    and quantity > 0) or
    (kind = 'issue'      and quantity < 0) or
    (kind = 'adjustment' and quantity <> 0) or
    (kind = 'transfer'   and quantity = 0)
  );

alter table public.stock_movements
  drop constraint if exists stock_movements_transfer_locations;
alter table public.stock_movements
  add constraint stock_movements_transfer_locations check (
    (kind = 'transfer'
      and from_location_id is not null
      and to_location_id is not null
      and from_location_id <> to_location_id)
    or
    (kind <> 'transfer'
      and from_location_id is null
      and to_location_id is null)
  );

create or replace function public.stock_movements_check_parents()
returns trigger
language plpgsql
as $$
declare
  material_company_id uuid;
  lot_company_id uuid;
  lot_material_id uuid;
  from_company_id uuid;
  to_company_id uuid;
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

  if new.from_location_id is not null then
    select company_id into from_company_id
    from public.locations
    where id = new.from_location_id;

    if from_company_id is null or from_company_id <> new.company_id then
      raise exception 'from_location_id % is invalid for this company',
        new.from_location_id
        using errcode = '23514';
    end if;
  end if;

  if new.to_location_id is not null then
    select company_id into to_company_id
    from public.locations
    where id = new.to_location_id;

    if to_company_id is null or to_company_id <> new.company_id then
      raise exception 'to_location_id % is invalid for this company',
        new.to_location_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

-- 4. RPC: whole-lot transfer ------------------------------------------------------

create or replace function public.transfer_lot(
  p_company_id uuid,
  p_lot_id uuid,
  p_to_location_id uuid,
  p_notes text default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v_lot record;
  v_from uuid;
  v_to_exists boolean;
  v_user uuid := auth.uid();
begin
  select id, material_id, status, quantity_on_hand, location_id
    into v_lot
  from public.material_lots
  where id = p_lot_id
    and company_id = p_company_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'lot % not found in this company', p_lot_id
      using errcode = '23503';
  end if;

  if v_lot.status <> 'released' then
    raise exception 'only released lots can be transferred (status: %)',
      v_lot.status
      using errcode = '23514';
  end if;

  if v_lot.quantity_on_hand <= 0 then
    raise exception 'lot % has no stock on hand to transfer', p_lot_id
      using errcode = '23514';
  end if;

  v_from := coalesce(v_lot.location_id, public.ensure_default_location(p_company_id));

  select exists (
    select 1 from public.locations
    where id = p_to_location_id
      and company_id = p_company_id
      and deleted_at is null
  ) into v_to_exists;

  if not v_to_exists then
    raise exception 'target location % not found in this company', p_to_location_id
      using errcode = '23503';
  end if;

  if p_to_location_id = v_from then
    raise exception 'lot is already at the target location'
      using errcode = '23514';
  end if;

  insert into public.stock_movements (
    company_id, material_id, lot_id, kind, quantity,
    from_location_id, to_location_id,
    occurred_at, notes, created_by
  )
  values (
    p_company_id, v_lot.material_id, p_lot_id, 'transfer', 0,
    v_from, p_to_location_id,
    now(),
    coalesce(p_notes, 'lot transfer') || ' (qty at transfer: ' || v_lot.quantity_on_hand || ')',
    v_user
  );

  update public.material_lots
     set location_id = p_to_location_id,
         updated_by = v_user
   where id = p_lot_id;
end;
$$;

grant execute on function public.transfer_lot(uuid, uuid, uuid, text) to authenticated;

-- 5. New lots are stamped with the company default location ----------------------

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
  v_location uuid;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'initial receipt quantity must be > 0'
      using errcode = '23514';
  end if;

  if p_owner_customer_id is not null and p_unit_cost is not null then
    raise exception 'customer-owned lots must not carry a unit cost'
      using errcode = '23514';
  end if;

  v_location := public.ensure_default_location(p_company_id);

  insert into public.material_lots (
    company_id, material_id, supplier_id, lot_number,
    received_at, expiry_date, unit_cost, currency, notes,
    owner_customer_id, location_id, created_by, updated_by
  )
  values (
    p_company_id, p_material_id, p_supplier_id, p_lot_number,
    coalesce(p_received_at, current_date), p_expiry_date,
    p_unit_cost, p_currency, p_notes,
    p_owner_customer_id, v_location, v_user, v_user
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

-- 6. complete_production_batch: output lot gets the default location --------------

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
  v_location uuid;
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

  v_location := public.ensure_default_location(p_company_id);

  insert into public.material_lots (
    company_id, material_id, supplier_id, lot_number,
    received_at, expiry_date, unit_cost, currency, status,
    location_id, notes, created_by, updated_by
  )
  values (
    p_company_id, v_order.finished_material_id, null, p_output_lot_number,
    current_date, p_output_expiry_date, v_output_unit_cost, v_cost_currency,
    'quarantine', v_location,
    'output of production batch ' || v_batch.batch_number, v_user, v_user
  )
  returning id into v_output_lot_id;

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
