-- Phase 8e — One incoming document (same supplier + invoice/irsaliye) with many
-- line items, recorded atomically. Each line either opens a new lot or adds to
-- an existing one; all share the document's supplier / date / currency / note.
-- security invoker: RLS + same-company triggers apply to every insert.

create or replace function public.create_receipt_document(
  p_company_id  uuid,
  p_supplier_id uuid,
  p_received_at date,
  p_currency    text,
  p_doc_notes   text,
  p_lines       jsonb
)
returns integer
language plpgsql
security invoker
as $$
declare
  v_line  jsonb;
  v_count int := 0;
  v_user  uuid := auth.uid();
  v_qty   numeric;
  v_unit  numeric;
  v_lot_id uuid;
  v_lot_company  uuid;
  v_lot_material uuid;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'En az bir satır gerekli.' using errcode = '23514';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_qty := (v_line->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Her satırda pozitif miktar gerekli.' using errcode = '23514';
    end if;
    v_unit := nullif(v_line->>'unit_cost', '')::numeric;

    if (v_line->>'mode') = 'existing_lot' then
      select company_id, material_id
        into v_lot_company, v_lot_material
        from public.material_lots
        where id = (v_line->>'lot_id')::uuid and deleted_at is null;

      if v_lot_company is null or v_lot_company <> p_company_id then
        raise exception 'Lot bulunamadı veya bu firmaya ait değil.'
          using errcode = '23503';
      end if;

      insert into public.stock_movements (
        company_id, material_id, lot_id, kind, quantity, unit_cost,
        occurred_at, notes, created_by
      ) values (
        p_company_id, v_lot_material, (v_line->>'lot_id')::uuid, 'receipt',
        v_qty, v_unit, coalesce(p_received_at::timestamptz, now()),
        p_doc_notes, v_user
      );
    else
      insert into public.material_lots (
        company_id, material_id, supplier_id, lot_number, received_at,
        expiry_date, unit_cost, currency, created_by, updated_by
      ) values (
        p_company_id, (v_line->>'material_id')::uuid, p_supplier_id,
        v_line->>'lot_number', coalesce(p_received_at, current_date),
        nullif(v_line->>'expiry_date', '')::date, v_unit, p_currency,
        v_user, v_user
      )
      returning id into v_lot_id;

      insert into public.stock_movements (
        company_id, material_id, lot_id, kind, quantity, unit_cost,
        occurred_at, notes, created_by
      ) values (
        p_company_id, (v_line->>'material_id')::uuid, v_lot_id, 'receipt',
        v_qty, v_unit, coalesce(p_received_at::timestamptz, now()),
        p_doc_notes, v_user
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.create_receipt_document(
  uuid, uuid, date, text, text, jsonb
) to authenticated;
