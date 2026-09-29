-- Depo kabul (sayımlı): depocu lotu okutur, sayar ve kendi deposuna alır.
--
-- İş kuralı (owner, 2026-09-29): fabrikadan gelen lot LTD deposuna alınırken
-- sayılır. Sayılan miktar stoktur; beklenenden farklıysa fark, neden ve
-- açıklamasıyla birlikte düzeltme hareketi olarak deftere yazılır. Transfer ve
-- düzeltme tek işlemdir: biri olmadan diğeri kalmaz.
-- Durum/konum kuralları transfer_lot ile aynıdır (yalnızca bloklu lot alınamaz).

create or replace function public.receive_lot_counted(
  p_company_id uuid,
  p_lot_id uuid,
  p_to_location_id uuid,
  p_counted_quantity numeric,
  p_notes text default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v_lot record;
  v_delta numeric;
begin
  if p_counted_quantity is null or p_counted_quantity <= 0 then
    raise exception 'counted quantity must be > 0' using errcode = '23514';
  end if;

  select id, material_id, quantity_on_hand
    into v_lot
  from public.material_lots
  where id = p_lot_id
    and company_id = p_company_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'lot % not found in this company', p_lot_id
      using errcode = '23503';
  end if;

  perform public.transfer_lot(
    p_company_id,
    p_lot_id,
    p_to_location_id,
    'depot receipt, counted ' || trim_scale(p_counted_quantity)
  );

  v_delta := p_counted_quantity - v_lot.quantity_on_hand;
  if v_delta <> 0 then
    insert into public.stock_movements (
      company_id, material_id, lot_id, kind, quantity,
      reason, notes, occurred_at, created_by
    )
    values (
      p_company_id, v_lot.material_id, p_lot_id, 'adjustment', v_delta,
      'Depo kabul sayım farkı (beklenen ' || trim_scale(v_lot.quantity_on_hand)
        || ', sayılan ' || trim_scale(p_counted_quantity) || ')',
      p_notes, now(), auth.uid()
    );
  end if;
end;
$$;

grant execute on function public.receive_lot_counted(
  uuid, uuid, uuid, numeric, text
) to authenticated;
