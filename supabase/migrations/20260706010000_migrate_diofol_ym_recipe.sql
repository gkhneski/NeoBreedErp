-- One-off, owner-approved data migration (2026-07-06).
--
-- Splits the existing single-stage DIOFOL 30 TABLET recipe (REC-01 v1:
-- 7 hammadde items -> Mamül directly) into the new two-stage YM model:
--   1) New semi-finished material "DIOFOL 30 TABLET - Yarı Mamül" (YM-01).
--   2) New published recipe (REC-02) producing 1000 unit of that YM from the
--      same 7 hammadde items REC-01 already used, same quantities.
--   3) New DRAFT v2 of REC-01 that consumes 1000 unit of the new YM instead
--      of the 7 raw hammadde directly.
-- Left for manual follow-up: the 3 existing ambalaj records for this product
-- (AMB-01 KUTU, AMB-02 FOLYO, AMB-03 ŞEFFAF PVC) need real per-batch
-- quantities added to the v2 draft by hand before it can be published — this
-- migration does not invent packaging quantities.
--
-- REC-01 v1 stays published and untouched, so existing production history
-- and any in-flight orders keep working. Scoped to a single company/material
-- pair — a no-op everywhere else (and a no-op on re-run).

do $$
declare
  v_company_id uuid := '4f73f01a-5467-4a2a-8616-b8c17f274ba5';
  v_finished_material_id uuid := '951fabe0-ee23-4db5-9a29-87acf0c6841b';
  v_old_recipe_id uuid := 'a9a20dcd-f019-4f0e-ab20-ea2659d704a1';
  v_actor uuid := '5bd5a688-f6c0-4c8e-a4e0-8bc380ce1cad';
  v_ym_material_id uuid;
  v_ym_recipe_id uuid;
  v_new_version_id uuid;
begin
  if not exists (select 1 from public.recipes where id = v_old_recipe_id) then
    return;
  end if;
  if exists (select 1 from public.materials where company_id = v_company_id and code = 'YM-01') then
    return;
  end if;

  insert into public.materials (
    company_id, code, name, type, base_uom, created_by, updated_by
  ) values (
    v_company_id, 'YM-01', 'DIOFOL 30 TABLET - Yarı Mamül', 'semi', 'unit', v_actor, v_actor
  )
  returning id into v_ym_material_id;

  insert into public.recipes (
    company_id, finished_material_id, code, name, version, status, mode,
    yield_quantity, yield_uom, created_by, updated_by
  ) values (
    v_company_id, v_ym_material_id, 'REC-02', 'DIOFOL 30 TABLET (YM)', 1, 'published', 'quantity',
    1000, 'unit', v_actor, v_actor
  )
  returning id into v_ym_recipe_id;

  insert into public.recipe_items (
    company_id, recipe_id, material_id, position, quantity, uom, percentage, active, created_by, updated_by
  )
  select v_company_id, v_ym_recipe_id, ri.material_id, ri.position, ri.quantity, ri.uom, ri.percentage, ri.active, v_actor, v_actor
  from public.recipe_items ri
  where ri.recipe_id = v_old_recipe_id;

  insert into public.recipes (
    company_id, finished_material_id, code, name, version, status, mode,
    yield_quantity, yield_uom, notes, created_by, updated_by
  ) values (
    v_company_id, v_finished_material_id, 'REC-01.v2', 'DIOFOL 30 TABLET', 2, 'draft', 'quantity',
    1000, 'unit',
    'YM/Mamül göçü: YM-01 kalemi otomatik eklendi. Yayınlamadan önce AMB-01/AMB-02/AMB-03 ambalaj kalemlerini gerçek parti miktarlarıyla ekleyip yayınlayın.',
    v_actor, v_actor
  )
  returning id into v_new_version_id;

  insert into public.recipe_items (
    company_id, recipe_id, material_id, position, quantity, uom, active, created_by, updated_by
  ) values (
    v_company_id, v_new_version_id, v_ym_material_id, 1, 1000, 'unit', true, v_actor, v_actor
  );
end $$;
