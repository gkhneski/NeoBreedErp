-- Depo kabul sayım farkı firma protokolüne (audit_log) de yazılır.
--
-- İş kuralı (owner, 2026-10-03): depocu sayımı sistemdeki miktardan farklı
-- girip onayladığında bu bir elle düzeltmedir. Stok hareketi (adjustment) tek
-- başına yetmez; kim, ne zaman, hangi lotu, beklenen/sayılan ne, neden —
-- değiştirilemez protokolde de durur. Transfer + düzeltme + protokol tek işlemdir.

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
  v_to record;
  v_delta numeric;
begin
  if p_counted_quantity is null or p_counted_quantity <= 0 then
    raise exception 'counted quantity must be > 0' using errcode = '23514';
  end if;

  select l.id, l.material_id, l.quantity_on_hand, l.lot_number, l.location_id,
         m.code as material_code, m.name as material_name, m.base_uom
    into v_lot
  from public.material_lots l
  join public.materials m on m.id = l.material_id
  where l.id = p_lot_id
    and l.company_id = p_company_id
    and l.deleted_at is null
  for update of l;

  if not found then
    raise exception 'lot % not found in this company', p_lot_id
      using errcode = '23503';
  end if;

  select code, name into v_to
  from public.locations
  where id = p_to_location_id and company_id = p_company_id;

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

    insert into public.audit_log (
      company_id, actor_id, action, target_table, target_id, target_label,
      reason, diff
    )
    values (
      p_company_id, auth.uid(), 'depot_receipt_count_correction',
      'material_lots', p_lot_id::text, v_lot.lot_number,
      p_notes,
      jsonb_build_object(
        'material_code', v_lot.material_code,
        'material_name', v_lot.material_name,
        'uom', v_lot.base_uom,
        'expected', v_lot.quantity_on_hand,
        'counted', p_counted_quantity,
        'delta', v_delta,
        'to_location_code', v_to.code,
        'to_location_name', v_to.name
      )
    );
  end if;
end;
$$;

grant execute on function public.receive_lot_counted(
  uuid, uuid, uuid, numeric, text
) to authenticated;
