-- Phase 9a — B2B ordering portal foundation.
-- Pharmacy buyers (external, NOT company_users) order from a dedicated /portal
-- surface; regional managers (internal) order on behalf of pharmacies. Buyer intent
-- lives in sales_orders; the depot later converts an order into a shipment.
--
-- Isolation principle: buyers are bound to a `customers` row via `customer_users`
-- and are never `company_users`, so existing membership-based RLS denies them every
-- ERP table by default. They only reach the `buyer_catalog` view and their OWN
-- sales_orders via the narrow buyer policies below.

-- 0. regional_manager role -------------------------------------------------------

alter table public.company_users
  drop constraint if exists company_users_role_check;

alter table public.company_users
  add constraint company_users_role_check
  check (
    role in (
      'company_admin',
      'production_manager',
      'quality_manager',
      'operator',
      'viewer',
      'company_user',
      'regional_manager'
    )
  );

-- 1. customer_users (buyer identity bridge) --------------------------------------
-- One auth user maps to one customer per company; a customer may have many users.

create table if not exists public.customer_users (
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, company_id)
);

drop trigger if exists customer_users_set_updated_at on public.customer_users;
create trigger customer_users_set_updated_at
  before update on public.customer_users
  for each row execute function public.set_updated_at();

create index if not exists customer_users_company_idx
  on public.customer_users(company_id) where deleted_at is null;
create index if not exists customer_users_customer_idx
  on public.customer_users(customer_id) where deleted_at is null;

alter table public.customer_users enable row level security;

-- A buyer can read their OWN mapping (needed so the buyer policies on other tables
-- can resolve their customer_id). Staff manage mappings for their company.
drop policy if exists customer_users_self_select on public.customer_users;
create policy customer_users_self_select on public.customer_users
  for select using (user_id = auth.uid());

drop policy if exists customer_users_staff_select on public.customer_users;
create policy customer_users_staff_select on public.customer_users
  for select using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists customer_users_staff_modify on public.customer_users;
create policy customer_users_staff_modify on public.customer_users
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

create or replace function public.customer_users_check_parents()
returns trigger
language plpgsql
as $$
declare
  v_customer_company uuid;
begin
  select company_id into v_customer_company
  from public.customers where id = new.customer_id;

  if v_customer_company is null then
    raise exception 'customer_id % does not exist', new.customer_id
      using errcode = '23503';
  end if;

  if v_customer_company <> new.company_id then
    raise exception 'customer_id % belongs to a different company', new.customer_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists customer_users_check_parents on public.customer_users;
create trigger customer_users_check_parents
  before insert or update of company_id, customer_id
  on public.customer_users
  for each row execute function public.customer_users_check_parents();

-- 2. product_catalog (staff-curated portal listing + B2B price) -------------------

create table if not exists public.product_catalog (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  sale_price numeric(12, 2),
  is_listed boolean not null default false,
  low_stock_threshold integer not null default 10 check (low_stock_threshold >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

drop trigger if exists product_catalog_set_updated_at on public.product_catalog;
create trigger product_catalog_set_updated_at
  before update on public.product_catalog
  for each row execute function public.set_updated_at();

create index if not exists product_catalog_company_idx
  on public.product_catalog(company_id) where deleted_at is null;
create unique index if not exists product_catalog_company_material_unique
  on public.product_catalog(company_id, material_id) where deleted_at is null;

alter table public.product_catalog enable row level security;

-- Only staff touch the catalog. Buyers read it through buyer_catalog (definer view).
drop policy if exists product_catalog_staff_all on public.product_catalog;
create policy product_catalog_staff_all on public.product_catalog
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

create or replace function public.product_catalog_check_parents()
returns trigger
language plpgsql
as $$
declare
  v_material_company uuid;
  v_material_type text;
begin
  select company_id, type into v_material_company, v_material_type
  from public.materials where id = new.material_id;

  if v_material_company is null then
    raise exception 'material_id % does not exist', new.material_id
      using errcode = '23503';
  end if;
  if v_material_company <> new.company_id then
    raise exception 'material_id % belongs to a different company', new.material_id
      using errcode = '23514';
  end if;
  if v_material_type <> 'finished' then
    raise exception 'only finished products can be listed (got %)', v_material_type
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists product_catalog_check_parents on public.product_catalog;
create trigger product_catalog_check_parents
  before insert or update of company_id, material_id
  on public.product_catalog
  for each row execute function public.product_catalog_check_parents();

-- 3. buyer_catalog view (safe columns only; definer bypasses base RLS) ------------
-- Exposes name/image/price + a coarse availability bucket. No cost, no SKT, no exact
-- quantity. Self-scoped to the buyer's company via customer_users + auth.uid().

drop view if exists public.buyer_catalog;
create view public.buyer_catalog
with (security_invoker = false) as
select
  pc.company_id,
  pc.material_id,
  m.code,
  m.name,
  m.barcode,
  m.base_uom,
  pc.sale_price,
  (
    select rp.image_url
    from public.marketplace_remote_products rp
    where rp.company_id = pc.company_id
      and rp.channel = 'trendyol'
      and rp.barcode = m.barcode
    limit 1
  ) as image_url,
  case
    when coalesce(stk.on_hand, 0) <= 0 then 'out'
    when coalesce(stk.on_hand, 0) < pc.low_stock_threshold then 'low'
    else 'in'
  end as availability
from public.product_catalog pc
join public.materials m
  on m.id = pc.material_id and m.deleted_at is null
left join lateral (
  select sum(l.quantity_on_hand) as on_hand
  from public.material_lots l
  where l.material_id = pc.material_id
    and l.company_id = pc.company_id
    and l.status = 'released'
    and l.owner_customer_id is null
    and l.deleted_at is null
    and l.quantity_on_hand > 0
) stk on true
where pc.is_listed = true
  and pc.deleted_at is null
  and pc.company_id in (
    select company_id from public.customer_users
    where user_id = auth.uid() and deleted_at is null
  );

grant select on public.buyer_catalog to authenticated;

-- 4. sales_orders + sales_order_items --------------------------------------------

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  code text not null,
  status text not null default 'placed'
    check (status in ('placed', 'confirmed', 'preparing', 'shipped', 'cancelled')),
  source text not null check (source in ('portal', 'rep')),
  placed_by uuid references auth.users(id) on delete set null,
  seen_at timestamptz,
  shipment_id uuid references public.shipments(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

drop trigger if exists sales_orders_set_updated_at on public.sales_orders;
create trigger sales_orders_set_updated_at
  before update on public.sales_orders
  for each row execute function public.set_updated_at();

create index if not exists sales_orders_company_idx on public.sales_orders(company_id);
create index if not exists sales_orders_company_status_idx
  on public.sales_orders(company_id, status) where deleted_at is null;
create index if not exists sales_orders_customer_idx
  on public.sales_orders(customer_id) where deleted_at is null;
create index if not exists sales_orders_company_unseen_idx
  on public.sales_orders(company_id) where seen_at is null and deleted_at is null;
create unique index if not exists sales_orders_company_code_unique
  on public.sales_orders(company_id, code) where deleted_at is null;

alter table public.sales_orders enable row level security;

-- Staff: full access for their company.
drop policy if exists sales_orders_staff_all on public.sales_orders;
create policy sales_orders_staff_all on public.sales_orders
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

-- Buyer: read their own orders.
drop policy if exists sales_orders_buyer_select on public.sales_orders;
create policy sales_orders_buyer_select on public.sales_orders
  for select using (
    customer_id in (
      select customer_id from public.customer_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

-- Buyer: place a portal order for their own customer.
drop policy if exists sales_orders_buyer_insert on public.sales_orders;
create policy sales_orders_buyer_insert on public.sales_orders
  for insert with check (
    source = 'portal'
    and customer_id in (
      select customer_id from public.customer_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

create or replace function public.sales_orders_check_parents()
returns trigger
language plpgsql
as $$
declare
  v_customer_company uuid;
  v_shipment_company uuid;
begin
  select company_id into v_customer_company
  from public.customers where id = new.customer_id;

  if v_customer_company is null then
    raise exception 'customer_id % does not exist', new.customer_id
      using errcode = '23503';
  end if;
  if v_customer_company <> new.company_id then
    raise exception 'customer_id % belongs to a different company', new.customer_id
      using errcode = '23514';
  end if;

  if new.shipment_id is not null then
    select company_id into v_shipment_company
    from public.shipments where id = new.shipment_id;
    if v_shipment_company is null then
      raise exception 'shipment_id % does not exist', new.shipment_id
        using errcode = '23503';
    end if;
    if v_shipment_company <> new.company_id then
      raise exception 'shipment_id % belongs to a different company', new.shipment_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists sales_orders_check_parents on public.sales_orders;
create trigger sales_orders_check_parents
  before insert or update of company_id, customer_id, shipment_id
  on public.sales_orders
  for each row execute function public.sales_orders_check_parents();

create table if not exists public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  quantity numeric(18, 6) not null check (quantity > 0),
  unit_price numeric(12, 2),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists sales_order_items_company_idx
  on public.sales_order_items(company_id);
create index if not exists sales_order_items_order_idx
  on public.sales_order_items(order_id);

alter table public.sales_order_items enable row level security;

drop policy if exists sales_order_items_staff_all on public.sales_order_items;
create policy sales_order_items_staff_all on public.sales_order_items
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

drop policy if exists sales_order_items_buyer_select on public.sales_order_items;
create policy sales_order_items_buyer_select on public.sales_order_items
  for select using (
    order_id in (
      select so.id from public.sales_orders so
      where so.customer_id in (
        select customer_id from public.customer_users
        where user_id = auth.uid() and deleted_at is null
      )
    )
  );

drop policy if exists sales_order_items_buyer_insert on public.sales_order_items;
create policy sales_order_items_buyer_insert on public.sales_order_items
  for insert with check (
    order_id in (
      select so.id from public.sales_orders so
      where so.customer_id in (
        select customer_id from public.customer_users
        where user_id = auth.uid() and deleted_at is null
      )
    )
  );

create or replace function public.sales_order_items_check_parents()
returns trigger
language plpgsql
as $$
declare
  v_order record;
  v_material_company uuid;
begin
  select company_id, status into v_order
  from public.sales_orders where id = new.order_id;

  if v_order.company_id is null then
    raise exception 'order_id % does not exist', new.order_id
      using errcode = '23503';
  end if;
  if v_order.company_id <> new.company_id then
    raise exception 'order_id % belongs to a different company', new.order_id
      using errcode = '23514';
  end if;

  select company_id into v_material_company
  from public.materials where id = new.material_id;
  if v_material_company is null then
    raise exception 'material_id % does not exist', new.material_id
      using errcode = '23503';
  end if;
  if v_material_company <> new.company_id then
    raise exception 'material_id % belongs to a different company', new.material_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists sales_order_items_check_parents on public.sales_order_items;
create trigger sales_order_items_check_parents
  before insert or update
  on public.sales_order_items
  for each row execute function public.sales_order_items_check_parents();
