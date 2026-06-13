-- Phase 8b: barcode (GTIN) on materials
--
-- Adds an optional barcode to finished products so warehouse staff can
-- scan a box during stock onboarding (lots/onboarding) and the system
-- resolves the product automatically. Also lets the marketplace import
-- auto-match Trendyol listings by barcode.
--
-- Nullable: raw materials normally stay null. Unique per company among
-- non-deleted rows (a barcode identifies exactly one product per tenant).

alter table public.materials
  add column if not exists barcode text;

create unique index if not exists materials_company_barcode_unique
  on public.materials(company_id, barcode)
  where barcode is not null and deleted_at is null;
