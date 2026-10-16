-- Depocu hatalı stok girişini düzeltir.
--
-- İş kuralı (owner, 2026-10-16): depocu (İlker) eldeki ürünü yanlış adet, lot
-- no veya SKT ile girdiyse kendisi düzeltebilmeli. Kapsam yalnızca satış
-- deposundaki (LTD, is_default = false) bitmiş ürün ve promosyon lotlarıdır;
-- fabrika/hammadde lotlarına dokunamaz. Her düzeltme gerekçeyle birlikte
-- değiştirilemez protokole (audit_log) yazılır. Defter append-only kalır:
-- miktar farkı 'adjustment' hareketiyle düşülür/eklenir.
-- Idempotent: tekrar çalıştırmak güvenlidir.

-- 1. Ortak kapsam kontrolü ------------------------------------------------------

create or replace function public.depot_lot_for_correction(
  p_company_id uuid,
  p_lot_id uuid
)
returns table (
  id uuid,
  material_id uuid,
  lot_number text,
  expiry_date date,
  quantity_on_hand numeric,
  material_code text,
  material_name text,
  base_uom text
)
language plpgsql
security invoker
as $$
begin
  return query
  select l.id, l.material_id, l.lot_number, l.expiry_date, l.quantity_on_hand,
         m.code, m.name, m.base_uom
  from public.material_lots l
  join public.materials m on m.id = l.material_id
  join public.location_depots ld on ld.location_id = l.location_id
  where l.id = p_lot_id
    and l.company_id = p_company_id
    and l.deleted_at is null
    and m.type in ('finished', 'promo')
    and ld.depot_is_default = false
  for update of l;

  if not found then
    raise exception 'lot % is not a sales-depot finished/promo lot', p_lot_id
      using errcode = '23503';
  end if;
end;
$$;

-- 2. correct_depot_lot: adet / lot no / SKT düzeltmesi ---------------------------

create or replace function public.correct_depot_lot(
  p_company_id uuid,
  p_lot_id uuid,
  p_quantity numeric,
  p_lot_number text,
  p_expiry_date date,
  p_reason text
)
returns void
language plpgsql
security invoker
as $$
declare
  v_lot record;
  v_delta numeric;
  v_lot_number text := nullif(trim(p_lot_number), '');
  v_reason text := nullif(trim(p_reason), '');
begin
  if v_reason is null then
    raise exception 'reason is required' using errcode = '23514';
  end if;
  if v_lot_number is null then
    raise exception 'lot number is required' using errcode = '23514';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'quantity must be >= 0' using errcode = '23514';
  end if;

  select * into v_lot
  from public.depot_lot_for_correction(p_company_id, p_lot_id);

  v_delta := p_quantity - v_lot.quantity_on_hand;

  if v_delta = 0
     and v_lot_number = v_lot.lot_number
     and p_expiry_date is not distinct from v_lot.expiry_date then
    return;
  end if;

  update public.material_lots
     set lot_number = v_lot_number,
         expiry_date = p_expiry_date,
         updated_by = auth.uid()
   where id = p_lot_id
     and company_id = p_company_id;

  if v_delta <> 0 then
    insert into public.stock_movements (
      company_id, material_id, lot_id, kind, quantity,
      reason, notes, occurred_at, created_by
    )
    values (
      p_company_id, v_lot.material_id, p_lot_id, 'adjustment', v_delta,
      'Depo stok düzeltmesi (hatalı giriş)', v_reason, now(), auth.uid()
    );
  end if;

  insert into public.audit_log (
    company_id, actor_id, action, target_table, target_id, target_label,
    reason, diff
  )
  values (
    p_company_id, auth.uid(), 'depot_lot_correction',
    'material_lots', p_lot_id::text, v_lot_number,
    v_reason,
    jsonb_build_object(
      'material_code', v_lot.material_code,
      'material_name', v_lot.material_name,
      'uom', v_lot.base_uom,
      'before', jsonb_build_object(
        'quantity', v_lot.quantity_on_hand,
        'lot_number', v_lot.lot_number,
        'expiry_date', v_lot.expiry_date
      ),
      'after', jsonb_build_object(
        'quantity', p_quantity,
        'lot_number', v_lot_number,
        'expiry_date', p_expiry_date
      ),
      'delta', v_delta
    )
  );
end;
$$;

grant execute on function public.correct_depot_lot(
  uuid, uuid, numeric, text, date, text
) to authenticated;

-- 3. void_depot_lot: yanlış ürünle açılmış lotu kaldır ---------------------------
-- Sevk edilmiş / üretimde kullanılmış / üretim çıktısı lot silinemez.

create or replace function public.void_depot_lot(
  p_company_id uuid,
  p_lot_id uuid,
  p_reason text
)
returns void
language plpgsql
security invoker
as $$
declare
  v_lot record;
  v_reason text := nullif(trim(p_reason), '');
begin
  if v_reason is null then
    raise exception 'reason is required' using errcode = '23514';
  end if;

  select * into v_lot
  from public.depot_lot_for_correction(p_company_id, p_lot_id);

  if exists (
       select 1 from public.stock_movements
       where company_id = p_company_id and lot_id = p_lot_id
         and (kind = 'issue' or batch_id is not null)
     )
     or exists (
       select 1 from public.shipment_items where lot_id = p_lot_id
     )
     or exists (
       select 1 from public.production_batches
       where company_id = p_company_id and output_lot_id = p_lot_id
     ) then
    raise exception 'lot % has been shipped or used; cannot void', p_lot_id
      using errcode = 'P0001', hint = 'lot_in_use';
  end if;

  if v_lot.quantity_on_hand > 0 then
    insert into public.stock_movements (
      company_id, material_id, lot_id, kind, quantity,
      reason, notes, occurred_at, created_by
    )
    values (
      p_company_id, v_lot.material_id, p_lot_id, 'adjustment',
      -v_lot.quantity_on_hand,
      'Depo stok girişi silindi (hatalı kayıt)', v_reason, now(), auth.uid()
    );
  end if;

  update public.material_lots
     set deleted_at = now(),
         updated_by = auth.uid()
   where id = p_lot_id
     and company_id = p_company_id;

  insert into public.audit_log (
    company_id, actor_id, action, target_table, target_id, target_label,
    reason, diff
  )
  values (
    p_company_id, auth.uid(), 'depot_lot_void',
    'material_lots', p_lot_id::text, v_lot.lot_number,
    v_reason,
    jsonb_build_object(
      'material_code', v_lot.material_code,
      'material_name', v_lot.material_name,
      'uom', v_lot.base_uom,
      'before', jsonb_build_object(
        'quantity', v_lot.quantity_on_hand,
        'lot_number', v_lot.lot_number,
        'expiry_date', v_lot.expiry_date
      ),
      'delta', -v_lot.quantity_on_hand
    )
  );
end;
$$;

grant execute on function public.void_depot_lot(uuid, uuid, text)
  to authenticated;
