-- =============================================================================
-- Phase 5b — Step 2: Lots + Stock movements
-- Contract: docs/DATABASE_CONTRACT.md §11
-- =============================================================================
-- Adds:
--   * public.material_lots     (per-company, per-material lot/batch)
--   * public.stock_movements   (append-only signed-quantity ledger)
--   * Triggers:
--       - material_lots_check_parents  (same-company guard for material/supplier)
--       - stock_movements_check_parents (same-company + lot↔material consistency)
--       - stock_movements_apply_to_lot  (recompute lot.quantity_on_hand,
--                                        serialize via SELECT ... FOR UPDATE,
--                                        forbid going negative)
--       - stock_movements_block_mutation (ledger is append-only)
-- Idempotent: safe to re-run.
-- =============================================================================

-- 1. material_lots --------------------------------------------------------------

create table if not exists public.material_lots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete set null,
  lot_number text not null,
  received_at date not null default current_date,
  expiry_date date,
  unit_cost numeric(18, 4),
  currency text,
  quantity_on_hand numeric(18, 6) not null default 0 check (quantity_on_hand >= 0),
  status text not null default 'quarantine'
    check (status in ('quarantine', 'released', 'blocked')),
  coa_file_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

drop trigger if exists material_lots_set_updated_at on public.material_lots;
create trigger material_lots_set_updated_at
  before update on public.material_lots
  for each row execute function public.set_updated_at();

create index if not exists material_lots_company_id_idx
  on public.material_lots(company_id);
create index if not exists material_lots_company_material_idx
  on public.material_lots(company_id, material_id);
create unique index if not exists material_lots_company_material_lot_unique
  on public.material_lots(company_id, material_id, lot_number)
  where deleted_at is null;
create index if not exists material_lots_supplier_idx
  on public.material_lots(supplier_id);
create index if not exists material_lots_expiry_idx
  on public.material_lots(company_id, expiry_date)
  where deleted_at is null;
create index if not exists material_lots_deleted_at_idx
  on public.material_lots(deleted_at);

alter table public.material_lots enable row level security;

drop policy if exists material_lots_select_member on public.material_lots;
create policy material_lots_select_member on public.material_lots
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists material_lots_modify_member on public.material_lots;
create policy material_lots_modify_member on public.material_lots
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

-- Cross-tenant guard: material and supplier must belong to the lot's company_id.
create or replace function public.material_lots_check_parents()
returns trigger
language plpgsql
as $$
declare
  material_company_id uuid;
  supplier_company_id uuid;
begin
  select company_id into material_company_id
  from public.materials
  where id = new.material_id;

  if material_company_id is null then
    raise exception 'material_id % does not exist', new.material_id
      using errcode = '23503';
  end if;

  if material_company_id <> new.company_id then
    raise exception 'material_id % belongs to a different company', new.material_id
      using errcode = '23514';
  end if;

  if new.supplier_id is not null then
    select company_id into supplier_company_id
    from public.suppliers
    where id = new.supplier_id;

    if supplier_company_id is null then
      raise exception 'supplier_id % does not exist', new.supplier_id
        using errcode = '23503';
    end if;

    if supplier_company_id <> new.company_id then
      raise exception 'supplier_id % belongs to a different company', new.supplier_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists material_lots_check_parents on public.material_lots;
create trigger material_lots_check_parents
  before insert or update of material_id, supplier_id, company_id
  on public.material_lots
  for each row execute function public.material_lots_check_parents();

-- 2. stock_movements ------------------------------------------------------------

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  lot_id uuid not null references public.material_lots(id) on delete restrict,
  kind text not null check (kind in ('receipt', 'issue', 'adjustment')),
  quantity numeric(18, 6) not null,
  unit_cost numeric(18, 4),
  reason text,
  occurred_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint stock_movements_signed_qty check (
    (kind = 'receipt'    and quantity > 0) or
    (kind = 'issue'      and quantity < 0) or
    (kind = 'adjustment' and quantity <> 0)
  )
);

create index if not exists stock_movements_company_id_idx
  on public.stock_movements(company_id);
create index if not exists stock_movements_company_material_idx
  on public.stock_movements(company_id, material_id);
create index if not exists stock_movements_lot_id_idx
  on public.stock_movements(lot_id);
create index if not exists stock_movements_company_occurred_idx
  on public.stock_movements(company_id, occurred_at desc);
create index if not exists stock_movements_company_kind_idx
  on public.stock_movements(company_id, kind);

alter table public.stock_movements enable row level security;

drop policy if exists stock_movements_select_member on public.stock_movements;
create policy stock_movements_select_member on public.stock_movements
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

-- Inserts only; updates/deletes are blocked by trigger below.
drop policy if exists stock_movements_insert_member on public.stock_movements;
create policy stock_movements_insert_member on public.stock_movements
  for insert
  with check (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

-- Cross-tenant + parent-consistency guard
create or replace function public.stock_movements_check_parents()
returns trigger
language plpgsql
as $$
declare
  material_company_id uuid;
  lot_company_id uuid;
  lot_material_id uuid;
begin
  select company_id into material_company_id
  from public.materials
  where id = new.material_id;

  if material_company_id is null then
    raise exception 'material_id % does not exist', new.material_id
      using errcode = '23503';
  end if;

  if material_company_id <> new.company_id then
    raise exception 'material_id % belongs to a different company', new.material_id
      using errcode = '23514';
  end if;

  select company_id, material_id
    into lot_company_id, lot_material_id
  from public.material_lots
  where id = new.lot_id;

  if lot_company_id is null then
    raise exception 'lot_id % does not exist', new.lot_id
      using errcode = '23503';
  end if;

  if lot_company_id <> new.company_id then
    raise exception 'lot_id % belongs to a different company', new.lot_id
      using errcode = '23514';
  end if;

  if lot_material_id <> new.material_id then
    raise exception 'lot_id % belongs to a different material', new.lot_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists stock_movements_check_parents on public.stock_movements;
create trigger stock_movements_check_parents
  before insert on public.stock_movements
  for each row execute function public.stock_movements_check_parents();

-- Append-only enforcement
create or replace function public.stock_movements_block_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'stock_movements is append-only; record an adjustment instead'
    using errcode = '23514';
end;
$$;

drop trigger if exists stock_movements_block_update on public.stock_movements;
create trigger stock_movements_block_update
  before update on public.stock_movements
  for each row execute function public.stock_movements_block_mutation();

drop trigger if exists stock_movements_block_delete on public.stock_movements;
create trigger stock_movements_block_delete
  before delete on public.stock_movements
  for each row execute function public.stock_movements_block_mutation();

-- Quantity-on-hand maintenance: serialize via SELECT ... FOR UPDATE on the lot,
-- recompute total, abort if it would go negative (ERP_RULES §4 + §10).
create or replace function public.stock_movements_apply_to_lot()
returns trigger
language plpgsql
as $$
declare
  new_total numeric(18, 6);
begin
  perform 1 from public.material_lots where id = new.lot_id for update;

  select coalesce(sum(quantity), 0)
    into new_total
  from public.stock_movements
  where lot_id = new.lot_id;

  if new_total < 0 then
    raise exception 'stock movement would drive lot % below zero (would be %)',
      new.lot_id, new_total
      using errcode = '23514';
  end if;

  update public.material_lots
     set quantity_on_hand = new_total,
         updated_at = now()
   where id = new.lot_id;

  return new;
end;
$$;

drop trigger if exists stock_movements_apply_to_lot on public.stock_movements;
create trigger stock_movements_apply_to_lot
  after insert on public.stock_movements
  for each row execute function public.stock_movements_apply_to_lot();

-- 3. RPC: create a lot together with its initial receipt in one transaction ----
-- security invoker: RLS applies to both inserts (lot + movement).

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
  p_movement_notes text
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_lot_id uuid;
  v_user uuid := auth.uid();
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'initial receipt quantity must be > 0'
      using errcode = '23514';
  end if;

  insert into public.material_lots (
    company_id, material_id, supplier_id, lot_number,
    received_at, expiry_date, unit_cost, currency, notes,
    created_by, updated_by
  )
  values (
    p_company_id, p_material_id, p_supplier_id, p_lot_number,
    coalesce(p_received_at, current_date), p_expiry_date,
    p_unit_cost, p_currency, p_notes,
    v_user, v_user
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
  uuid, uuid, uuid, text, date, date, numeric, text, numeric, text, text
) to authenticated;
