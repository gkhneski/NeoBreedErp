-- Phase 8g — Marketplace orders cache, to notify the depot operator when a new
-- Trendyol order arrives. A poll upserts recent orders here; rows with
-- seen_at = null are "new to the depot" until the operator marks them handled.

create table if not exists public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel text not null check (channel in ('trendyol', 'hepsiburada')),
  order_number text not null,
  status text,
  customer_name text,
  order_date timestamptz,
  total_price numeric(12,2),
  lines jsonb,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  fetched_at timestamptz not null default now(),
  constraint marketplace_orders_company_channel_order_unique
    unique (company_id, channel, order_number)
);

create index if not exists marketplace_orders_company_unseen_idx
  on public.marketplace_orders(company_id, channel)
  where seen_at is null;

alter table public.marketplace_orders enable row level security;

drop policy if exists marketplace_orders_select_member on public.marketplace_orders;
create policy marketplace_orders_select_member on public.marketplace_orders
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists marketplace_orders_modify_member on public.marketplace_orders;
create policy marketplace_orders_modify_member on public.marketplace_orders
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
