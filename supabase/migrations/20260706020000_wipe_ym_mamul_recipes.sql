-- One-off, owner-approved data cleanup (2026-07-06).
-- Wipes ALL semi-finished (YM) and finished (Mamül) recipes for NeuPharma
-- A.S. so the owner can rebuild them from scratch under the new two-stage
-- model (YM = hammadde only, Mamül = YM + ambalaj).
--
-- Scoped to a single company_id — a no-op on any other / fresh database.
-- Verified before writing this migration: no production_orders or
-- production_batches reference any of these recipes, so no FK blockers.
-- Materials (YM-01, DIOFOL 30 TABLET, ambalaj cards, etc.) are left
-- untouched — only the recipes/recipe_items rows are removed.

delete from public.recipe_items where company_id = '4f73f01a-5467-4a2a-8616-b8c17f274ba5';
delete from public.recipes      where company_id = '4f73f01a-5467-4a2a-8616-b8c17f274ba5';
