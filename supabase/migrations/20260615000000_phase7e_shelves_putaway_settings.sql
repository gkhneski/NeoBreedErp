-- Phase 7e — Shelves, put-away, stock onboarding & expiry settings.
-- Contract: docs/DATABASE_CONTRACT.md §19 (signed off 2026-06-12).

-- 1. locations hierarchy: depot → shelf ------------------------------------------

alter table public.locations
  add column if not exists kind text not null default 'depot';
alter table public.locations
  drop constraint if exists locations_kind_check;
alter table public.locations
  add constraint locations_kind_check
  check (kind in ('depot', 'shelf'));

alter table public.locations
  add column if not exists parent_id uuid references public.locations(id) on delete restrict;

alter table public.locations
  drop constraint if exists locations_shelf_has_parent;
alter table public.locations
  add constraint locations_shelf_has_parent
  check ((kind = 'shelf') = (parent_id is not null));

alter table public.locations
  drop constraint if exists locations_default_is_depot;
alter table public.locations
  add constraint locations_default_is_depot
  check (not is_default or kind = 'depot');

create index if not exists locations_parent_idx
  on public.locations(parent_id)
  where deleted_at is null;

create or replace function public.locations_check_parent()
returns trigger
language plpgsql
as $$
declare
  v_parent record;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'location cannot be its own parent'
      using errcode = '23514';
  end if;

  select company_id, kind, deleted_at into v_parent
  from public.locations
  where id = new.parent_id;

  if not found then
    raise exception 'parent_id % does not exist', new.parent_id
      using errcode = '23503';
  end if;

  if v_parent.company_id <> new.company_id then
    raise exception 'parent_id % belongs to a different company', new.parent_id
      using errcode = '23514';
  end if;

  if v_parent.kind <> 'depot' then
    raise exception 'shelves can only be created under a depot'
      using errcode = '23514';
  end if;

  if v_parent.deleted_at is not null then
    raise exception 'parent depot % is deleted', new.parent_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists locations_check_parent on public.locations;
create trigger locations_check_parent
  before insert or update of parent_id, kind, company_id
  on public.locations
  for each row execute function public.locations_check_parent();

-- 2. company_settings (expiry thresholds, singleton per company) -----------------

create table if not exists public.company_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  expiry_critical_days integer not null default 90,
  expiry_warning_days integer not null default 180,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint company_settings_critical_positive check (expiry_critical_days > 0),
  constraint company_settings_warning_positive check (expiry_warning_days > 0),
  constraint company_settings_critical_lt_warning
    check (expiry_critical_days < expiry_warning_days)
);

drop trigger if exists company_settings_set_updated_at on public.company_settings;
create trigger company_settings_set_updated_at
  before update on public.company_settings
  for each row execute function public.set_updated_at();

alter table public.company_settings enable row level security;

drop policy if exists company_settings_select_member on public.company_settings;
create policy company_settings_select_member on public.company_settings
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists company_settings_modify_member on public.company_settings;
create policy company_settings_modify_member on public.company_settings
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

-- 3. transfer_lot: only blocked lots are rejected ---------------------------------

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

  if v_lot.status = 'blocked' then
    raise exception 'blocked lots cannot be transferred (status: %)',
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

-- 4. create_lot_with_receipt v2: p_status + p_location_id -------------------------

drop function if exists public.create_lot_with_receipt(
  uuid, uuid, uuid, text, date, date, numeric, text, numeric, text, text, uuid
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
  p_owner_customer_id uuid default null,
  p_status text default 'quarantine',
  p_location_id uuid default null
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

  if p_status not in ('quarantine', 'released') then
    raise exception 'invalid initial lot status: %', p_status
      using errcode = '23514';
  end if;

  if p_location_id is not null then
    if not exists (
      select 1 from public.locations
      where id = p_location_id
        and company_id = p_company_id
        and deleted_at is null
    ) then
      raise exception 'location % not found in this company', p_location_id
        using errcode = '23503';
    end if;
  end if;

  v_location := coalesce(p_location_id, public.ensure_default_location(p_company_id));

  insert into public.material_lots (
    company_id, material_id, supplier_id, lot_number,
    received_at, expiry_date, unit_cost, currency, status, notes,
    owner_customer_id, location_id, created_by, updated_by
  )
  values (
    p_company_id, p_material_id, p_supplier_id, p_lot_number,
    coalesce(p_received_at, current_date), p_expiry_date,
    p_unit_cost, p_currency, p_status, p_notes,
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

grant execute on function public.create_lot_with_receipt(
  uuid, uuid, uuid, text, date, date, numeric, text, numeric, text, text, uuid, text, uuid
) to authenticated;

-- 5. complete_production_batch v2: p_location_id (put-away) -----------------------

drop function if exists public.complete_production_batch(
  uuid, uuid, numeric, text, date, jsonb
);

create or replace function public.complete_production_batch(
  p_company_id uuid,
  p_batch_id uuid,
  p_actual_quantity numeric,
  p_output_lot_number text,
  p_output_expiry_date date,
  p_consumed jsonb,
  p_location_id uuid default null
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

  if p_location_id is not null then
    if not exists (
      select 1 from public.locations
      where id = p_location_id
        and company_id = p_company_id
        and deleted_at is null
    ) then
      raise exception 'location % not found in this company', p_location_id
        using errcode = '23503';
    end if;
  end if;

  v_location := coalesce(p_location_id, public.ensure_default_location(p_company_id));

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

grant execute on function public.complete_production_batch(
  uuid, uuid, numeric, text, date, jsonb, uuid
) to authenticated;
