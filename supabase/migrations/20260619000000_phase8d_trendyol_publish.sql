-- Phase 8d — Publish ERP products to Trendyol (Model B).
-- Tracks the async content-creation batch + approval state on the listing that
-- a publish creates. Additive only.

alter table public.marketplace_listings
  add column if not exists content_batch_id text;

alter table public.marketplace_listings
  add column if not exists publish_status text not null default 'none'
    check (publish_status in ('none', 'pending', 'approved', 'rejected'));

alter table public.marketplace_listings
  add column if not exists publish_error text;
