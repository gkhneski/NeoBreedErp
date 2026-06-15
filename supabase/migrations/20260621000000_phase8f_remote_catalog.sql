-- Phase 8f — Persisted snapshot of the marketplace catalog (Trendyol first).
-- "Trendyol'dan Listeleri Çek" used to fetch live every page load and keep
-- nothing. Now each refresh upserts the store's products (with image) here, so
-- the screen shows them instantly and can auto-refresh every 10 minutes.

create table if not exists public.marketplace_remote_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel text not null check (channel in ('trendyol', 'hepsiburada')),
  barcode text not null,
  title text,
  image_url text,
  stock_code text,
  sale_price numeric(12,2),
  list_price numeric(12,2),
  quantity integer,
  approved boolean,
  on_sale boolean,
  fetched_at timestamptz not null default now(),
  constraint marketplace_remote_products_company_channel_barcode_unique
    unique (company_id, channel, barcode)
);

create index if not exists marketplace_remote_products_company_idx
  on public.marketplace_remote_products(company_id, channel);

alter table public.marketplace_remote_products enable row level security;

drop policy if exists marketplace_remote_products_select_member
  on public.marketplace_remote_products;
create policy marketplace_remote_products_select_member
  on public.marketplace_remote_products
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists marketplace_remote_products_modify_member
  on public.marketplace_remote_products;
create policy marketplace_remote_products_modify_member
  on public.marketplace_remote_products
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
