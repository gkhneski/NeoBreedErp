-- One-off, owner-approved data cleanup (2026-07-06).
-- Removes the leftover YM-01 (DIOFOL 30 TABLET - Yarı Mamül) semi-finished
-- material card so it no longer appears in the recipe output picker, now
-- that its recipes were already wiped in 20260706020000. Owner is rebuilding
-- the YM material and recipe from scratch.
--
-- Verified before writing this migration: no material_lots, recipe_items,
-- recipes, production_orders, production_batches, stock_movements,
-- marketplace_listings, cost_snapshots, or sales_order_items reference this
-- material — safe hard delete, no FK blockers.

delete from public.materials
where id = 'fef0ea89-e2d1-4c10-8a81-44d340175104'
  and company_id = '4f73f01a-5467-4a2a-8616-b8c17f274ba5';
