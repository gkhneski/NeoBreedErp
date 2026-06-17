-- Phase 12 — Bitmiş ürün stoğunu KUTU birimine taşı.
-- Üretim tablet/adet cinsinden girilir (reçete yield = 1 tablet) ama satılabilir
-- birim KUTU'dur ("30 TABLET" = 1 kutu). Çıkış lotu artık depoya kutu olarak girer:
--   kutu = üretilen tablet / units_per_pack
-- Aşağı akış (satış, sevkiyat, Trendyol push, B2B) zaten quantity_on_hand okuduğu
-- için otomatik kutuya geçer. Üretim partisinin actual_quantity'si tablet kalır
-- (üretim verimi); yalnızca STOK lotu kutuya çevrilir.

-- 1. Paket boyu (kutu içi adet) — yalnız bitmiş ürün için anlamlı, default 1.
alter table public.materials
  add column if not exists units_per_pack integer not null default 1
  check (units_per_pack > 0);

-- 2. RPC: çıkış lotunu kutu olarak üret (miktar + birim maliyet ÷ paket).
create or replace function public.complete_production_batch(
  p_company_id uuid,
  p_batch_id uuid,
  p_actual_quantity numeric,
  p_output_lot_number text,
  p_output_expiry_date date,
  p_consumed jsonb,
  p_location_id uuid default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_batch record;
  v_order record;
  v_user uuid := auth.uid();
  v_consumed_row record;
  v_lot record;
  v_signed_qty numeric;
  v_line_cost numeric(18, 4);
  v_cost_total numeric := 0;
  v_has_cost boolean := false;
  v_inferred_currency text;
  v_output_lot_id uuid;
  v_output_unit_cost numeric;
  v_cost_total_final numeric(18, 4);
  v_cost_currency text;
  v_location uuid;
  v_pack integer;
  v_output_qty numeric;
begin
  if p_actual_quantity is null or p_actual_quantity <= 0 then
    raise exception 'actual_quantity must be > 0' using errcode = '23514';
  end if;

  if p_output_lot_number is null or btrim(p_output_lot_number) = '' then
    raise exception 'output_lot_number is required' using errcode = '23514';
  end if;

  if p_consumed is null or jsonb_typeof(p_consumed) <> 'array'
     or jsonb_array_length(p_consumed) = 0 then
    raise exception 'p_consumed must be a non-empty array' using errcode = '23514';
  end if;

  select id, company_id, production_order_id, batch_number, recipe_id,
         planned_quantity, uom, status
    into v_batch
  from public.production_batches
  where id = p_batch_id
    and company_id = p_company_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'batch % not found in this company', p_batch_id
      using errcode = '23503';
  end if;

  if v_batch.status <> 'in_progress' then
    raise exception 'batch must be in_progress to complete (currently: %)',
      v_batch.status
      using errcode = '23514';
  end if;

  select id, company_id, status, finished_material_id
    into v_order
  from public.production_orders
  where id = v_batch.production_order_id
    and company_id = p_company_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'order for batch % not found', p_batch_id using errcode = '23503';
  end if;

  if v_order.status <> 'in_progress' then
    raise exception 'order must be in_progress (currently: %)', v_order.status
      using errcode = '23514';
  end if;

  -- Bitmiş ürünün paket boyu: stok kutu olarak girecek (tablet / paket).
  select coalesce(units_per_pack, 1) into v_pack
  from public.materials where id = v_order.finished_material_id;
  if v_pack is null or v_pack < 1 then
    v_pack := 1;
  end if;
  v_output_qty := p_actual_quantity / v_pack;

  for v_consumed_row in
    select * from jsonb_to_recordset(p_consumed)
      as x(lot_id uuid, quantity numeric)
  loop
    if v_consumed_row.lot_id is null then
      raise exception 'consumed entry missing lot_id' using errcode = '23514';
    end if;

    if v_consumed_row.quantity is null or v_consumed_row.quantity <= 0 then
      raise exception 'consumed quantity must be > 0 for lot %',
        v_consumed_row.lot_id
        using errcode = '23514';
    end if;

    select id, material_id, company_id, unit_cost, currency, status,
           owner_customer_id
      into v_lot
    from public.material_lots
    where id = v_consumed_row.lot_id
      and deleted_at is null;

    if not found then
      raise exception 'lot % does not exist', v_consumed_row.lot_id
        using errcode = '23503';
    end if;

    if v_lot.company_id <> p_company_id then
      raise exception 'lot % belongs to a different company', v_consumed_row.lot_id
        using errcode = '23514';
    end if;

    if v_lot.status <> 'released' then
      raise exception 'lot % is not released (status: %); cannot consume',
        v_consumed_row.lot_id, v_lot.status
        using errcode = '23514';
    end if;

    v_signed_qty := -1 * v_consumed_row.quantity;

    insert into public.stock_movements (
      company_id, material_id, lot_id, batch_id, kind, quantity,
      occurred_at, notes, created_by
    )
    values (
      p_company_id, v_lot.material_id, v_lot.id, p_batch_id,
      'issue', v_signed_qty,
      now(), 'production batch consumption', v_user
    );

    if v_lot.owner_customer_id is not null then
      v_line_cost := 0;
    elsif v_lot.unit_cost is not null then
      v_has_cost := true;

      if v_inferred_currency is null then
        v_inferred_currency := v_lot.currency;
      elsif v_lot.currency is not null
            and v_lot.currency <> v_inferred_currency then
        raise exception
          'consumed lots have mixed currencies (% vs %); MVP requires single currency',
          v_inferred_currency, v_lot.currency
          using errcode = '23514';
      end if;

      v_line_cost := (v_consumed_row.quantity * v_lot.unit_cost)::numeric(18, 4);
      v_cost_total := v_cost_total + (v_consumed_row.quantity * v_lot.unit_cost);
    else
      v_line_cost := null;
    end if;

    insert into public.cost_snapshots (
      company_id, production_batch_id, material_id, lot_id,
      quantity, unit_cost, currency, line_cost, customer_owned, created_by
    )
    values (
      p_company_id, p_batch_id, v_lot.material_id, v_lot.id,
      v_consumed_row.quantity, v_lot.unit_cost, v_lot.currency, v_line_cost,
      (v_lot.owner_customer_id is not null),
      v_user
    );
  end loop;

  if v_has_cost then
    v_cost_total_final := v_cost_total;
    v_cost_currency := v_inferred_currency;
    -- Birim maliyet KUTU başına (toplam maliyet / kutu sayısı).
    v_output_unit_cost := v_cost_total / v_output_qty;
  else
    v_cost_total_final := null;
    v_cost_currency := null;
    v_output_unit_cost := null;
  end if;

  if p_location_id is not null then
    if not exists (
      select 1 from public.locations
      where id = p_location_id
        and company_id = p_company_id
        and deleted_at is null
    ) then
      raise exception 'location % not found in this company', p_location_id
        using errcode = '23503';
    end if;
  end if;

  v_location := coalesce(p_location_id, public.ensure_default_location(p_company_id));

  insert into public.material_lots (
    company_id, material_id, supplier_id, lot_number,
    received_at, expiry_date, unit_cost, currency, status,
    location_id, notes, created_by, updated_by
  )
  values (
    p_company_id, v_order.finished_material_id, null, p_output_lot_number,
    current_date, p_output_expiry_date, v_output_unit_cost, v_cost_currency,
    'quarantine', v_location,
    'output of production batch ' || v_batch.batch_number, v_user, v_user
  )
  returning id into v_output_lot_id;

  -- Stok hareketi KUTU miktarıyla — lotun on-hand'i kutu olur.
  insert into public.stock_movements (
    company_id, material_id, lot_id, batch_id, kind, quantity, unit_cost,
    occurred_at, notes, created_by
  )
  values (
    p_company_id, v_order.finished_material_id, v_output_lot_id, p_batch_id,
    'receipt', v_output_qty, v_output_unit_cost,
    now(), 'production batch output', v_user
  );

  -- Parti actual_quantity'si üretilen TABLET olarak kalır (üretim verimi).
  update public.production_batches
     set status = 'completed',
         actual_quantity = p_actual_quantity,
         output_lot_id = v_output_lot_id,
         completed_at = now(),
         cost_total = v_cost_total_final,
         cost_currency = v_cost_currency,
         updated_by = v_user
   where id = p_batch_id;

  update public.production_orders
     set status = 'completed',
         completed_at = now(),
         updated_by = v_user
   where id = v_order.id;

  return v_output_lot_id;
end;
$$;

grant execute on function public.complete_production_batch(
  uuid, uuid, numeric, text, date, jsonb, uuid
) to authenticated;
