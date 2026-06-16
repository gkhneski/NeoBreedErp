-- Phase 9b — push new B2B orders to the depot instantly.
-- Adds sales_orders to the Realtime publication so the operator's browser gets an
-- INSERT event the moment an order is placed (no page refresh, works in background
-- tabs). RLS still gates which rows each subscriber may receive.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sales_orders'
  ) then
    alter publication supabase_realtime add table public.sales_orders;
  end if;
end $$;
