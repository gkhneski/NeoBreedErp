-- Phase 6 (Hardening): performance indexes for hot query paths.
-- All additive (create index if not exists); no data or schema mutation.

-- Dashboard "Kritik Stok" + warehouse status filters:
-- material_lots where company_id = ? and status = ... and deleted_at is null
create index if not exists material_lots_company_status_idx
  on public.material_lots(company_id, status)
  where deleted_at is null;

-- Warehouse "Güncel Lotlar" listing:
-- material_lots where company_id = ? order by updated_at desc
create index if not exists material_lots_company_updated_idx
  on public.material_lots(company_id, updated_at desc)
  where deleted_at is null;

-- Cost report date-range scan:
-- production_batches where company_id = ? and completed_at between ? and ?
create index if not exists production_batches_company_completed_idx
  on public.production_batches(company_id, completed_at desc)
  where deleted_at is null;
