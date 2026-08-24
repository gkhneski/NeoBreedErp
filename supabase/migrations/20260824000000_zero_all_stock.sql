-- One-off, owner-approved stock reset (2026-08-24).
-- Owner is restarting physical stock tracking from zero today: every lot
-- (raw materials, semi-finished, finished goods, packaging) is brought to
-- quantity_on_hand = 0 via balancing 'adjustment' movements.
--
-- Nothing is deleted: material cards, lots, recipes, orders and the full
-- movement history stay intact — the ledger stays append-only, exactly as
-- its guard trigger demands. Scoped to NeuPharma A.S.; no-op elsewhere.

insert into public.stock_movements (
  company_id, material_id, lot_id, kind, quantity, reason, occurred_at, notes
)
select
  l.company_id,
  l.material_id,
  l.id,
  'adjustment',
  -l.quantity_on_hand,
  'stock_reset',
  now(),
  'Full stock reset 2026-08-24: fresh count starts from zero (owner request)'
from public.material_lots l
where l.company_id = '4f73f01a-5467-4a2a-8616-b8c17f274ba5'
  and l.deleted_at is null
  and l.quantity_on_hand > 0;
