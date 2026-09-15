-- Stock movement reversal (storno).
--
-- The ledger stays append-only. A mis-entered movement (e.g. a duplicate
-- goods receipt) is cancelled by inserting a counter-movement that points
-- back at the original via reverses_movement_id. The lot trigger recomputes
-- quantity_on_hand from the sum, so the net effect is zero.
--
-- If the reversal empties a lot that had no other activity (the lot itself was
-- created by the mistaken receipt), the lot is soft-deleted so it disappears
-- from stock views together with its two ledger rows.

alter table public.stock_movements
  add column if not exists reverses_movement_id uuid null
    references public.stock_movements(id) on delete restrict;

-- A movement can be reversed at most once.
create unique index if not exists stock_movements_reverses_movement_id_uidx
  on public.stock_movements(reverses_movement_id)
  where reverses_movement_id is not null;

create or replace function public.reverse_stock_movement(
  p_company_id  uuid,
  p_movement_id uuid,
  p_reason      text default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_orig public.stock_movements%rowtype;
  v_new_id uuid;
  v_user uuid := auth.uid();
  v_other_count integer;
  v_on_hand numeric(18, 6);
begin
  select * into v_orig
  from public.stock_movements
  where id = p_movement_id and company_id = p_company_id;

  if v_orig.id is null then
    raise exception 'movement % not found for company', p_movement_id
      using errcode = 'P0002';
  end if;

  if v_orig.kind = 'transfer' then
    raise exception 'transfer movements cannot be reversed'
      using errcode = '23514';
  end if;

  if v_orig.reverses_movement_id is not null then
    raise exception 'a reversal movement cannot itself be reversed'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from public.stock_movements
    where reverses_movement_id = v_orig.id
  ) then
    raise exception 'movement % is already reversed', p_movement_id
      using errcode = '23505';
  end if;

  insert into public.stock_movements (
    company_id, material_id, lot_id, batch_id, kind, quantity, unit_cost,
    reason, occurred_at, notes, created_by, reverses_movement_id
  )
  values (
    v_orig.company_id, v_orig.material_id, v_orig.lot_id, v_orig.batch_id,
    'adjustment', -v_orig.quantity, v_orig.unit_cost,
    coalesce(nullif(trim(p_reason), ''), 'Hatalı kayıt iptali'),
    now(), null, v_user, v_orig.id
  )
  returning id into v_new_id;

  -- Lot created solely by the reversed movement: nothing else ever touched it.
  select count(*) into v_other_count
  from public.stock_movements
  where lot_id = v_orig.lot_id
    and id not in (v_orig.id, v_new_id);

  select quantity_on_hand into v_on_hand
  from public.material_lots
  where id = v_orig.lot_id;

  if v_other_count = 0 and v_on_hand = 0 then
    update public.material_lots
       set deleted_at = now(),
           updated_at = now(),
           updated_by = v_user
     where id = v_orig.lot_id
       and deleted_at is null;
  end if;

  return v_new_id;
end;
$$;

grant execute on function public.reverse_stock_movement(uuid, uuid, text)
  to authenticated;
