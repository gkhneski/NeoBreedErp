-- Fix: BEFORE DELETE trigger must return OLD (returning NEW = NULL silently
-- skips the delete). Shipped immutability behavior unchanged.

create or replace function public.shipments_block_shipped_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'shipped' then
    raise exception 'shipped shipments are immutable'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
