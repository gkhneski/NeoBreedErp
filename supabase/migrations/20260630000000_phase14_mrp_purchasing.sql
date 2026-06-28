-- Phase 14: MRP + Purchasing
--
-- Manual internal customer orders (sales_orders.source='manual') drive MRP, which
-- explodes the two-level BOM (Mamül -> YM -> raw/packaging), nets against on-hand
-- stock, and yields (a) production needs and (b) purchase needs. Purchase needs
-- become supplier-grouped purchase orders, sent and then received into stock.

-- 1) Allow manually-entered internal customer orders.
alter table public.sales_orders
  drop constraint if exists sales_orders_source_check;
alter table public.sales_orders
  add constraint sales_orders_source_check
  check (source in ('portal', 'rep', 'manual'));

-- 2) Purchase orders (one supplier, many lines).
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'received', 'cancelled')),
  currency text,
  notes text,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

drop trigger if exists purchase_orders_set_updated_at on public.purchase_orders;
create trigger purchase_orders_set_updated_at
  before update on public.purchase_orders
  for each row execute function public.set_updated_at();

create index if not exists purchase_orders_company_id_idx on public.purchase_orders(company_id);
create index if not exists purchase_orders_supplier_idx on public.purchase_orders(supplier_id);
create index if not exists purchase_orders_deleted_at_idx on public.purchase_orders(deleted_at);
create unique index if not exists purchase_orders_company_code_unique
  on public.purchase_orders(company_id, code) where deleted_at is null;

alter table public.purchase_orders enable row level security;

drop policy if exists purchase_orders_select_member on public.purchase_orders;
create policy purchase_orders_select_member on public.purchase_orders
  for select using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists purchase_orders_modify_member on public.purchase_orders;
create policy purchase_orders_modify_member on public.purchase_orders
  for all using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  ) with check (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

-- 3) Purchase order lines.
create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  quantity numeric(18,6) not null check (quantity > 0),
  uom text not null,
  unit_cost numeric(18,4),
  received_quantity numeric(18,6) not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists purchase_order_lines_company_id_idx on public.purchase_order_lines(company_id);
create index if not exists purchase_order_lines_po_idx on public.purchase_order_lines(purchase_order_id);
create index if not exists purchase_order_lines_material_idx on public.purchase_order_lines(material_id);

alter table public.purchase_order_lines enable row level security;

drop policy if exists purchase_order_lines_select_member on public.purchase_order_lines;
create policy purchase_order_lines_select_member on public.purchase_order_lines
  for select using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists purchase_order_lines_modify_member on public.purchase_order_lines;
create policy purchase_order_lines_modify_member on public.purchase_order_lines
  for all using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  ) with check (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );
