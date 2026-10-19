-- Shipment form: inline new recipients (ecza deposu / şahıs) with full contact
-- details, company-defined custom channels, and a built-in 'sahis' channel.

-- 1. customers: kind + richer contact/address fields ----------------------------

alter table public.customers
  add column if not exists kind text not null default 'company',
  add column if not exists contact_name text,
  add column if not exists tax_office text,
  add column if not exists city text,
  add column if not exists district text;

alter table public.customers drop constraint if exists customers_kind_check;
alter table public.customers
  add constraint customers_kind_check
  check (kind in ('company', 'pharma_warehouse', 'pharmacy', 'individual'));

-- 2. shipment_channels: company-defined sales channels --------------------------

create table if not exists public.shipment_channels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

drop trigger if exists shipment_channels_set_updated_at on public.shipment_channels;
create trigger shipment_channels_set_updated_at
  before update on public.shipment_channels
  for each row execute function public.set_updated_at();

create index if not exists shipment_channels_company_idx
  on public.shipment_channels(company_id);
create unique index if not exists shipment_channels_company_name_unique
  on public.shipment_channels(company_id, lower(btrim(name)))
  where deleted_at is null;

alter table public.shipment_channels enable row level security;

drop policy if exists shipment_channels_select_member on public.shipment_channels;
create policy shipment_channels_select_member on public.shipment_channels
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists shipment_channels_modify_member on public.shipment_channels;
create policy shipment_channels_modify_member on public.shipment_channels
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

-- 3. shipments: 'sahis' channel, custom channel link, recipient contact ---------

alter table public.shipments drop constraint if exists shipments_channel_check;
alter table public.shipments
  add constraint shipments_channel_check
  check (channel in ('ecza', 'sahis', 'trendyol', 'hepsiburada', 'diger'));

alter table public.shipments
  add column if not exists channel_id uuid
    references public.shipment_channels(id) on delete restrict,
  add column if not exists recipient_phone text,
  add column if not exists recipient_address text,
  add column if not exists recipient_city text;

create index if not exists shipments_channel_id_idx
  on public.shipments(company_id, channel_id)
  where channel_id is not null;

create or replace function public.shipments_check_channel()
returns trigger
language plpgsql
as $$
declare
  v_company uuid;
begin
  if new.channel_id is null then
    return new;
  end if;

  if new.channel <> 'diger' then
    raise exception 'custom channel_id requires channel = diger'
      using errcode = '23514';
  end if;

  select company_id into v_company
  from public.shipment_channels
  where id = new.channel_id;

  if v_company is null then
    raise exception 'channel_id % does not exist', new.channel_id
      using errcode = '23503';
  end if;

  if v_company <> new.company_id then
    raise exception 'channel_id % belongs to a different company', new.channel_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists shipments_check_channel on public.shipments;
create trigger shipments_check_channel
  before insert or update of company_id, channel, channel_id
  on public.shipments
  for each row execute function public.shipments_check_channel();
