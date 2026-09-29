-- Parti numarası artık firma genelinde değil ÜRÜN bazında benzersiz.
--
-- İş kuralı (owner, 2026-09-29): yarı mamül partisinin numarası mamüle aynen
-- taşınır (YM 2608006 -> Mamül 2608006). Firma geneli benzersizlik bunu
-- engelliyordu. Lot numarası zaten aynı mantıkta: material_lots
-- (company_id, material_id, lot_number) bazında benzersiz.
--
-- Ürün, partinin emrinden gelir (production_orders.finished_material_id);
-- production_batches'te ürün kolonu olmadığı için kural unique index yerine
-- trigger ile uygulanır. Advisory lock aynı numaranın eşzamanlı iki kaydını
-- sıraya sokar. Unique index gibi RLS'ten bağımsız çalışması için definer.

drop index if exists public.production_batches_company_number_unique;

create index if not exists production_batches_company_number_idx
  on public.production_batches (company_id, batch_number)
  where deleted_at is null;

create or replace function public.production_batches_number_unique_per_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_material uuid;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      new.company_id::text || ':' || new.batch_number, 0
    )
  );

  select finished_material_id into v_material
  from public.production_orders
  where id = new.production_order_id;

  if exists (
    select 1
    from public.production_batches b
    join public.production_orders o on o.id = b.production_order_id
    where b.company_id = new.company_id
      and b.batch_number = new.batch_number
      and b.deleted_at is null
      and b.id <> new.id
      and o.finished_material_id = v_material
  ) then
    raise exception 'batch number % is already used for this product',
      new.batch_number
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists production_batches_number_unique_per_product
  on public.production_batches;
create trigger production_batches_number_unique_per_product
  before insert or update of batch_number, production_order_id, deleted_at
  on public.production_batches
  for each row
  execute function public.production_batches_number_unique_per_product();
