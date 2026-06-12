-- Phase 8a — Marketplace connections, listings & price events (Trendyol first).
-- Contract: docs/DATABASE_CONTRACT.md §20 (signed off 2026-06-12).

-- 1. marketplace_connections — API secrets. RLS deny-all, service-role access only.

create table if not exists public.marketplace_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel text not null check (channel in ('trendyol', 'hepsiburada')),
  seller_id text not null,
  api_key text not null,
  api_secret text not null,
  enabled boolean not null default true,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint marketplace_connections_company_channel_unique unique (company_id, channel)
);

drop trigger if exists marketplace_connections_set_updated_at on public.marketplace_connections;
create trigger marketplace_connections_set_updated_at
  before update on public.marketplace_connections
  for each row execute function public.set_updated_at();

-- Deny-all by design: secrets are reachable only via the service role on the
-- server, behind an explicit company_admin guard. No member policies.
alter table public.marketplace_connections enable row level security;

-- 2. marketplace_listings — listing↔material mapping + pricing rule. Member RLS.

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel text not null check (channel in ('trendyol', 'hepsiburada')),
  material_id uuid not null references public.materials(id) on delete restrict,
  barcode text not null,
  stock_code text,
  title text,
  normal_sale_price numeric(12,2) not null,
  normal_list_price numeric(12,2),
  discount_price numeric(12,2),
  discount_threshold_days integer,
  sync_stock boolean not null default true,
  current_price_state text not null default 'unknown'
    check (current_price_state in ('normal', 'discounted', 'unknown')),
  last_synced_at timestamptz,
  last_batch_request_id text,
  sync_status text not null default 'never'
    check (sync_status in ('never', 'pending', 'ok', 'failed')),
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint marketplace_listings_sale_positive check (normal_sale_price > 0),
  constraint marketplace_listings_list_gte_sale
    check (normal_list_price is null or normal_list_price >= normal_sale_price),
  constraint marketplace_listings_discount_lt_normal
    check (
      discount_price is null
      or (discount_price > 0 and discount_price < normal_sale_price)
    ),
  constraint marketplace_listings_threshold_positive
    check (discount_threshold_days is null or discount_threshold_days > 0)
);

drop trigger if exists marketplace_listings_set_updated_at on public.marketplace_listings;
create trigger marketplace_listings_set_updated_at
  before update on public.marketplace_listings
  for each row execute function public.set_updated_at();

create unique index if not exists marketplace_listings_company_channel_material_unique
  on public.marketplace_listings(company_id, channel, material_id)
  where deleted_at is null;
create unique index if not exists marketplace_listings_company_channel_barcode_unique
  on public.marketplace_listings(company_id, channel, barcode)
  where deleted_at is null;
create index if not exists marketplace_listings_company_idx
  on public.marketplace_listings(company_id)
  where deleted_at is null;

create or replace function public.marketplace_listings_check_material()
returns trigger
language plpgsql
as $$
declare
  v_material record;
begin
  select company_id, type, deleted_at into v_material
  from public.materials
  where id = new.material_id;

  if not found then
    raise exception 'material_id % does not exist', new.material_id
      using errcode = '23503';
  end if;

  if v_material.company_id <> new.company_id then
    raise exception 'material_id % belongs to a different company', new.material_id
      using errcode = '23514';
  end if;

  if v_material.type <> 'finished' then
    raise exception 'marketplace listings require a finished material'
      using errcode = '23514';
  end if;

  if v_material.deleted_at is not null then
    raise exception 'material % is deleted', new.material_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists marketplace_listings_check_material on public.marketplace_listings;
create trigger marketplace_listings_check_material
  before insert or update of material_id, company_id
  on public.marketplace_listings
  for each row execute function public.marketplace_listings_check_material();

alter table public.marketplace_listings enable row level security;

drop policy if exists marketplace_listings_select_member on public.marketplace_listings;
create policy marketplace_listings_select_member on public.marketplace_listings
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists marketplace_listings_modify_member on public.marketplace_listings;
create policy marketplace_listings_modify_member on public.marketplace_listings
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

-- 3. marketplace_price_events — proposal queue + immutable-ish audit. Member RLS.

create table if not exists public.marketplace_price_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  kind text not null check (kind in ('discount', 'restore', 'manual')),
  old_price numeric(12,2),
  new_price numeric(12,2) not null check (new_price > 0),
  status text not null default 'pending'
    check (status in ('pending', 'pushed', 'confirmed', 'failed', 'dismissed')),
  batch_request_id text,
  error text,
  trigger_expiry_date date,
  trigger_days_left integer,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  acted_at timestamptz,
  acted_by uuid references auth.users(id) on delete set null
);

create unique index if not exists marketplace_price_events_one_pending
  on public.marketplace_price_events(listing_id)
  where status = 'pending';
create index if not exists marketplace_price_events_company_status_idx
  on public.marketplace_price_events(company_id, status);
create index if not exists marketplace_price_events_listing_idx
  on public.marketplace_price_events(listing_id);

alter table public.marketplace_price_events enable row level security;

drop policy if exists marketplace_price_events_select_member on public.marketplace_price_events;
create policy marketplace_price_events_select_member on public.marketplace_price_events
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists marketplace_price_events_modify_member on public.marketplace_price_events;
create policy marketplace_price_events_modify_member on public.marketplace_price_events
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
