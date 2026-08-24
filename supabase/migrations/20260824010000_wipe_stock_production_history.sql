-- One-off, owner-approved full history wipe (2026-08-24).
-- Follow-up to 20260824000000_zero_all_stock: zeroing was not enough — the
-- owner wants ALL past stock and production data gone, hard fresh start.
--
-- Deletes for NeuPharma A.S.: cost snapshots, stock movements, quality
-- checks, shipments (their items hold FK references to lots), production
-- batches, material lots, production orders.
--
-- KEEPS: material cards (raw/semi/finished/packaging), recipes, products,
-- customers, suppliers, sales/portal orders (their shipment links are set
-- null by FK), marketplace listings, users/settings.
--
-- Append-only ledger guards are lifted only inside this migration's
-- transaction; FK enforcement stays ON as a safety net.

alter table public.stock_movements disable trigger stock_movements_block_delete;
alter table public.cost_snapshots  disable trigger cost_snapshots_block_delete;

delete from public.cost_snapshots     where company_id = '4f73f01a-5467-4a2a-8616-b8c17f274ba5';
delete from public.stock_movements    where company_id = '4f73f01a-5467-4a2a-8616-b8c17f274ba5';
delete from public.quality_checks     where company_id = '4f73f01a-5467-4a2a-8616-b8c17f274ba5';
delete from public.shipments          where company_id = '4f73f01a-5467-4a2a-8616-b8c17f274ba5';
delete from public.production_batches where company_id = '4f73f01a-5467-4a2a-8616-b8c17f274ba5';
delete from public.material_lots      where company_id = '4f73f01a-5467-4a2a-8616-b8c17f274ba5';
delete from public.production_orders  where company_id = '4f73f01a-5467-4a2a-8616-b8c17f274ba5';

alter table public.stock_movements enable trigger stock_movements_block_delete;
alter table public.cost_snapshots  enable trigger cost_snapshots_block_delete;
