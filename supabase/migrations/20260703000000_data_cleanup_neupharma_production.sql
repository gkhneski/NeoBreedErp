-- One-off, owner-approved data cleanup (2026-06-28).
-- Wipes test PRODUCTION-STAGE data for NeuPharma A.S. ahead of real
-- semi-finished (YM) + finished (Mamül) go-live.
--
-- KEEPS untouched: raw material cards, ALL finished product cards, and
-- marketplace (Trendyol) listings/connections. Only manufacturing transaction
-- data is removed (recipes, production orders/batches, cost snapshots, lots,
-- stock movements, quality checks).
--
-- Scoped to a single company_id — a no-op on any other / fresh database.
-- The two append-only ledger guards are lifted only for the duration of this
-- migration's transaction; FK enforcement stays ON as a safety net.

alter table public.stock_movements disable trigger stock_movements_block_delete;
alter table public.cost_snapshots  disable trigger cost_snapshots_block_delete;

delete from public.cost_snapshots     where company_id = '4f73f01a-5467-4a2a-8616-b8c17f274ba5';
delete from public.stock_movements    where company_id = '4f73f01a-5467-4a2a-8616-b8c17f274ba5';
delete from public.quality_checks     where company_id = '4f73f01a-5467-4a2a-8616-b8c17f274ba5';
delete from public.production_batches where company_id = '4f73f01a-5467-4a2a-8616-b8c17f274ba5';
delete from public.material_lots      where company_id = '4f73f01a-5467-4a2a-8616-b8c17f274ba5';
delete from public.production_orders  where company_id = '4f73f01a-5467-4a2a-8616-b8c17f274ba5';
delete from public.recipe_items       where company_id = '4f73f01a-5467-4a2a-8616-b8c17f274ba5';
delete from public.recipes            where company_id = '4f73f01a-5467-4a2a-8616-b8c17f274ba5';

alter table public.stock_movements enable trigger stock_movements_block_delete;
alter table public.cost_snapshots  enable trigger cost_snapshots_block_delete;
