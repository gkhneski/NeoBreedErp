-- Phase 7d — Outbound shipments (depot clerk order preparation).
-- Contract: docs/DATABASE_CONTRACT.md §18 (signed off 2026-06-12).

-- 1. shipments --------------------------------------------------------------------

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  channel text not null check (channel in ('ecza', 'trendyol', 'hepsiburada', 'diger')),
  customer_id uuid references public.customers(id) on delete restrict,
  external_order_no text,
  recipient text,
  status text not null default 'open'
    check (status in ('open', 'preparing', 'shipped', 'cancelled')),
  carrier text,
  tracking_no text,
  notes text,
  shipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

drop trigger if exists shipments_set_updated_at on public.shipments;
create trigger shipments_set_updated_at
  before update on public.shipments
  for each row execute function public.set_updated_at();

create index if not exists shipments_company_id_idx on public.shipments(company_id);
create index if not exists shipments_company_status_idx
  on public.shipments(company_id, status)
  where deleted_at is null;
create index if not exists shipments_company_created_idx
  on public.shipments(company_id, created_at desc);
create unique index if not exists shipments_company_code_unique
  on public.shipments(company_id, code)
  where deleted_at is null;

alter table public.shipments enable row level security;

drop policy if exists shipments_select_member on public.shipments;
create policy shipments_select_member on public.shipments
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists shipments_modify_member on public.shipments;
create policy shipments_modify_member on public.shipments
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

create or replace function public.shipments_check_parents()
returns trigger
language plpgsql
as $$
declare
  customer_company_id uuid;
begin
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

drop trigger if exists shipments_check_parents on public.shipments;
create trigger shipments_check_parents
  before insert or update of company_id, customer_id
  on public.shipments
  for each row execute function public.shipments_check_parents();

-- Shipped shipments are immutable (except soft delete is also blocked).
create or replace function public.shipments_block_shipped_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'shipped' then
    raise exception 'shipped shipments are immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists shipments_block_shipped_mutation on public.shipments;
create trigger shipments_block_shipped_mutation
  before update or delete on public.shipments
  for each row execute function public.shipments_block_shipped_mutation();

-- 2. shipment_items ----------------------------------------------------------------

create table if not exists public.shipment_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  lot_id uuid not null references public.material_lots(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  quantity numeric(18, 6) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists shipment_items_company_id_idx
  on public.shipment_items(company_id);
create index if not exists shipment_items_shipment_idx
  on public.shipment_items(shipment_id);
create index if not exists shipment_items_lot_idx
  on public.shipment_items(lot_id);

alter table public.shipment_items enable row level security;

drop policy if exists shipment_items_select_member on public.shipment_items;
create policy shipment_items_select_member on public.shipment_items
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists shipment_items_modify_member on public.shipment_items;
create policy shipment_items_modify_member on public.shipment_items
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

create or replace function public.shipment_items_check_parents()
returns trigger
language plpgsql
as $$
declare
  v_shipment record;
  v_lot record;
begin
  select company_id, status into v_shipment
  from public.shipments
  where id = new.shipment_id;

  if v_shipment.company_id is null then
    raise exception 'shipment_id % does not exist', new.shipment_id
      using errcode = '23503';
  end if;

  if v_shipment.company_id <> new.company_id then
    raise exception 'shipment_id % belongs to a different company', new.shipment_id
      using errcode = '23514';
  end if;

  if v_shipment.status not in ('open', 'preparing') then
    raise exception 'items can only change while the shipment is open/preparing (status: %)',
      v_shipment.status
      using errcode = '23514';
  end if;

  select company_id, material_id into v_lot
  from public.material_lots
  where id = new.lot_id;

  if v_lot.company_id is null then
    raise exception 'lot_id % does not exist', new.lot_id
      using errcode = '23503';
  end if;

  if v_lot.company_id <> new.company_id then
    raise exception 'lot_id % belongs to a different company', new.lot_id
      using errcode = '23514';
  end if;

  if v_lot.material_id <> new.material_id then
    raise exception 'lot_id % belongs to a different material', new.lot_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists shipment_items_check_parents on public.shipment_items;
create trigger shipment_items_check_parents
  before insert or update
  on public.shipment_items
  for each row execute function public.shipment_items_check_parents();

-- Items of shipped shipments cannot be deleted either.
create or replace function public.shipment_items_block_after_ship()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status from public.shipments where id = old.shipment_id;
  if v_status = 'shipped' then
    raise exception 'items of a shipped shipment are immutable'
      using errcode = '23514';
  end if;
  return old;
end;
$$;

drop trigger if exists shipment_items_block_after_ship on public.shipment_items;
create trigger shipment_items_block_after_ship
  before delete on public.shipment_items
  for each row execute function public.shipment_items_block_after_ship();

-- 3. RPC: ship --------------------------------------------------------------------

create or replace function public.ship_shipment(
  p_company_id uuid,
  p_shipment_id uuid
)
returns void
language plpgsql
security invoker
as $$
declare
  v_shipment record;
  v_item record;
  v_lot record;
  v_user uuid := auth.uid();
  v_item_count int := 0;
begin
  select id, code, status into v_shipment
  from public.shipments
  where id = p_shipment_id
    and company_id = p_company_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'shipment % not found in this company', p_shipment_id
      using errcode = '23503';
  end if;

  if v_shipment.status not in ('open', 'preparing') then
    raise exception 'shipment cannot be shipped (status: %)', v_shipment.status
      using errcode = '23514';
  end if;

  for v_item in
    select id, lot_id, material_id, quantity
    from public.shipment_items
    where shipment_id = p_shipment_id
      and company_id = p_company_id
  loop
    v_item_count := v_item_count + 1;

    select id, status, quantity_on_hand into v_lot
    from public.material_lots
    where id = v_item.lot_id
      and company_id = p_company_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'lot % no longer exists', v_item.lot_id
        using errcode = '23503';
    end if;

    if v_lot.status <> 'released' then
      raise exception 'lot % is not released (status: %); cannot ship',
        v_item.lot_id, v_lot.status
        using errcode = '23514';
    end if;

    if v_lot.quantity_on_hand < v_item.quantity then
      raise exception 'lot % has insufficient stock (% available, % requested)',
        v_item.lot_id, v_lot.quantity_on_hand, v_item.quantity
        using errcode = '23514';
    end if;

    insert into public.stock_movements (
      company_id, material_id, lot_id, kind, quantity,
      occurred_at, notes, created_by
    )
    values (
      p_company_id, v_item.material_id, v_item.lot_id, 'issue',
      -1 * v_item.quantity,
      now(), 'shipment ' || v_shipment.code, v_user
    );
  end loop;

  if v_item_count = 0 then
    raise exception 'shipment has no items'
      using errcode = '23514';
  end if;

  update public.shipments
     set status = 'shipped',
         shipped_at = now(),
         updated_by = v_user
   where id = p_shipment_id;
end;
$$;

grant execute on function public.ship_shipment(uuid, uuid) to authenticated;
