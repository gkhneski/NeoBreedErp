-- Phase 8c — SKT-based tiered discount ladder (per company).
-- Replaces the single discount_price/threshold rule with a percentage ladder:
-- the closer a listing's nearest-expiry lot gets, the deeper the auto-discount.
-- The engine drives every listing from this ladder; manual approval still gates
-- any push to the marketplace.

-- 1. marketplace_discount_tiers — one ladder per company. Member RLS.

create table if not exists public.marketplace_discount_tiers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  max_days_left integer not null check (max_days_left > 0),
  discount_percent numeric(5,2) not null
    check (discount_percent >= 0 and discount_percent <= 95),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint marketplace_discount_tiers_company_band_unique
    unique (company_id, max_days_left)
);

create index if not exists marketplace_discount_tiers_company_idx
  on public.marketplace_discount_tiers(company_id, max_days_left);

drop trigger if exists marketplace_discount_tiers_set_updated_at
  on public.marketplace_discount_tiers;
create trigger marketplace_discount_tiers_set_updated_at
  before update on public.marketplace_discount_tiers
  for each row execute function public.set_updated_at();

alter table public.marketplace_discount_tiers enable row level security;

drop policy if exists marketplace_discount_tiers_select_member
  on public.marketplace_discount_tiers;
create policy marketplace_discount_tiers_select_member
  on public.marketplace_discount_tiers
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists marketplace_discount_tiers_modify_member
  on public.marketplace_discount_tiers;
create policy marketplace_discount_tiers_modify_member
  on public.marketplace_discount_tiers
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

-- 2. Track the sale price currently live on the marketplace, so the engine can
-- detect tier changes (e.g. 20% -> 40% -> 70%) and restores, not just on/off.

alter table public.marketplace_listings
  add column if not exists applied_sale_price numeric(12,2);
