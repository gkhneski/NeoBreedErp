-- Phase 13: Semi-finished (Yarımamül / YM) materials + two-level BOM.
--
-- A YM is produced by its own recipe (output) AND consumed as an ingredient in a
-- finished (Mamül) recipe. So 'semi' must be allowed as: a material type, a recipe
-- output, and a production order output. Recipe items already accept any material.

-- 1) Allow 'semi' as a material type.
alter table public.materials
  drop constraint if exists materials_type_check;
alter table public.materials
  add constraint materials_type_check
  check (type in ('raw', 'semi', 'finished'));

-- 2) Recipe output may be a finished OR a semi material.
create or replace function public.enforce_recipe_finished_material()
returns trigger
language plpgsql
as $$
declare
  m_company uuid;
  m_type text;
begin
  select company_id, type into m_company, m_type
  from public.materials where id = new.finished_material_id;
  if m_company is null then
    raise exception 'recipes.finished_material_id % not found', new.finished_material_id;
  end if;
  if m_company <> new.company_id then
    raise exception 'recipes.finished_material_id must be in same company';
  end if;
  if m_type not in ('finished', 'semi') then
    raise exception 'recipes.finished_material_id must reference a material of type finished or semi (got %)', m_type;
  end if;
  return new;
end;
$$;

-- 3) Production order output may be a finished OR a semi material (YM work order).
create or replace function public.production_orders_check_parents()
returns trigger
language plpgsql
as $$
declare
  material_company_id uuid;
  material_type text;
  recipe_company_id uuid;
  recipe_status text;
  recipe_finished_material_id uuid;
begin
  select company_id, type
    into material_company_id, material_type
  from public.materials
  where id = new.finished_material_id;

  if material_company_id is null then
    raise exception 'finished_material_id % does not exist', new.finished_material_id
      using errcode = '23503';
  end if;

  if material_company_id <> new.company_id then
    raise exception 'finished_material_id % belongs to a different company',
      new.finished_material_id
      using errcode = '23514';
  end if;

  if material_type not in ('finished', 'semi') then
    raise exception 'finished_material_id % must be of type finished or semi (got %)',
      new.finished_material_id, material_type
      using errcode = '23514';
  end if;

  select company_id, status, finished_material_id
    into recipe_company_id, recipe_status, recipe_finished_material_id
  from public.recipes
  where id = new.recipe_id;

  if recipe_company_id is null then
    raise exception 'recipe_id % does not exist', new.recipe_id
      using errcode = '23503';
  end if;

  if recipe_company_id <> new.company_id then
    raise exception 'recipe_id % belongs to a different company', new.recipe_id
      using errcode = '23514';
  end if;

  if recipe_status <> 'published' then
    raise exception 'recipe_id % is not published (status=%)',
      new.recipe_id, recipe_status
      using errcode = '23514';
  end if;

  if recipe_finished_material_id <> new.finished_material_id then
    raise exception 'recipe_id % is for a different finished material',
      new.recipe_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;
