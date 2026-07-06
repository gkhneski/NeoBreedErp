-- Phase 17: Enforce YM (semi) vs Mamül (finished) recipe item composition.
--
-- Business rule (owner decision, 2026-07-06): packaging must never enter a
-- semi-finished (YM) recipe, because YM stock is counted on the factory floor
-- and mixing in ambalaj breaks that count. So from now on:
--   - A YM recipe (output type = semi) may only consume hammadde
--     (raw materials that are NOT ambalaj, i.e. code not AMB-/PKG-).
--   - A Mamül recipe (output type = finished) may only consume a YM (semi)
--     and/or ambalaj (raw materials coded AMB-/PKG-) — never plain hammadde
--     directly.
-- Enforced at the DB layer (in addition to the app layer) so this holds even
-- if a row is inserted/updated outside the Next.js server actions.

create or replace function public.enforce_recipe_item_material_type()
returns trigger
language plpgsql
as $$
declare
  v_output_type text;
  v_item_type text;
  v_item_code text;
  v_is_packaging boolean;
begin
  select m.type into v_output_type
  from public.recipes r
  join public.materials m on m.id = r.finished_material_id
  where r.id = new.recipe_id;

  select type, code into v_item_type, v_item_code
  from public.materials
  where id = new.material_id;

  v_is_packaging := v_item_code ilike 'AMB-%' or v_item_code ilike 'PKG-%';

  if v_output_type = 'semi' then
    if v_item_type is distinct from 'raw' or v_is_packaging then
      raise exception 'Yarı mamül (YM) reçetesine sadece hammadde eklenebilir (kalem: %, tip: %)',
        v_item_code, v_item_type
        using errcode = '23514';
    end if;
  elsif v_output_type = 'finished' then
    if not (v_item_type = 'semi' or (v_item_type = 'raw' and v_is_packaging)) then
      raise exception 'Mamül reçetesine sadece yarı mamül (YM) veya ambalaj eklenebilir (kalem: %, tip: %)',
        v_item_code, v_item_type
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_recipe_item_material_type on public.recipe_items;
create trigger trg_enforce_recipe_item_material_type
  before insert or update on public.recipe_items
  for each row execute function public.enforce_recipe_item_material_type();
