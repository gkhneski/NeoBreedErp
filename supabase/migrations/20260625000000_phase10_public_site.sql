-- Phase 10 — Public marketing/SEO site publish store.
-- A public, no-auth marketing site (app/(site)/...) reads ONLY from these two
-- tables. They hold owner-approved, SEO-safe columns (title/description/bullets/
-- price snapshot/image) — never cost, SKT, or exact stock. Drafts stay invisible
-- until published.
--
-- Isolation principle (mirrors buyer_catalog / sales_orders): two RLS layers.
--   • Public read: anon + authenticated may select ONLY rows where status='published'.
--   • Staff write: company_users of the owning company get full access (drafts too).
-- A public visitor has no session, so they hit the anon policy and can read nothing
-- but published, safe columns here — every other ERP table denies anon by default.

-- 1. site_product_pages (one SEO page per finished product) -----------------------

create table if not exists public.site_product_pages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  slug text not null,
  seo_title text not null,
  seo_description text not null,
  bullets jsonb not null default '[]'::jsonb,
  keywords jsonb not null default '[]'::jsonb,
  og_image_url text,
  price_snapshot numeric(12, 2),
  barcode_snapshot text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

drop trigger if exists site_product_pages_set_updated_at on public.site_product_pages;
create trigger site_product_pages_set_updated_at
  before update on public.site_product_pages
  for each row execute function public.set_updated_at();

create index if not exists site_product_pages_company_idx
  on public.site_product_pages(company_id) where deleted_at is null;
create unique index if not exists site_product_pages_company_slug_unique
  on public.site_product_pages(company_id, slug) where deleted_at is null;
create unique index if not exists site_product_pages_company_material_unique
  on public.site_product_pages(company_id, material_id) where deleted_at is null;
create index if not exists site_product_pages_published_idx
  on public.site_product_pages(company_id) where status = 'published' and deleted_at is null;

alter table public.site_product_pages enable row level security;

-- Public read: only published rows (drafts hidden). Covers anon visitors + staff.
drop policy if exists site_product_pages_public_select on public.site_product_pages;
create policy site_product_pages_public_select on public.site_product_pages
  for select
  to anon, authenticated
  using (status = 'published' and deleted_at is null);

-- Staff: full access for their company (drafts included).
drop policy if exists site_product_pages_staff_all on public.site_product_pages;
create policy site_product_pages_staff_all on public.site_product_pages
  for all
  to authenticated
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

grant select on public.site_product_pages to anon;

create or replace function public.site_product_pages_check_parents()
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
    raise exception 'only finished products can have a site page (got %)', v_material_type
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists site_product_pages_check_parents on public.site_product_pages;
create trigger site_product_pages_check_parents
  before insert or update of company_id, material_id
  on public.site_product_pages
  for each row execute function public.site_product_pages_check_parents();

-- 2. site_articles (long-tail guide/blog content) --------------------------------

create table if not exists public.site_articles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  slug text not null,
  title text not null,
  excerpt text,
  body_md text not null default '',
  keywords jsonb not null default '[]'::jsonb,
  faq jsonb not null default '[]'::jsonb,
  cover_image_url text,
  related_material_ids jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

drop trigger if exists site_articles_set_updated_at on public.site_articles;
create trigger site_articles_set_updated_at
  before update on public.site_articles
  for each row execute function public.set_updated_at();

create index if not exists site_articles_company_idx
  on public.site_articles(company_id) where deleted_at is null;
create unique index if not exists site_articles_company_slug_unique
  on public.site_articles(company_id, slug) where deleted_at is null;
create index if not exists site_articles_published_idx
  on public.site_articles(company_id) where status = 'published' and deleted_at is null;

alter table public.site_articles enable row level security;

drop policy if exists site_articles_public_select on public.site_articles;
create policy site_articles_public_select on public.site_articles
  for select
  to anon, authenticated
  using (status = 'published' and deleted_at is null);

drop policy if exists site_articles_staff_all on public.site_articles;
create policy site_articles_staff_all on public.site_articles
  for all
  to authenticated
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

grant select on public.site_articles to anon;
