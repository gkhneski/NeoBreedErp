-- Satılabilir stok = satış deposundaki (LTD) serbest lotlar; promosyon ürünleri.
--
-- İş kuralı (owner, 2026-10-03):
--   * A.Ş.'nin ürettiği ve serbest bıraktığı lot, LTD deposuna sayılarak
--     alınmadan satılabilir stoğa GİRMEZ. Portal, pazaryeri, satış ekranı ve
--     sipariş→sevkiyat tahsisi yalnızca satış deposundaki lotları görür.
--   * Satış deposu = varsayılan olmayan (is_default = false) depo. Raflar
--     bağlı oldukları depoya göre değerlendirilir.
--   * Promosyon ürünleri (materials.type = 'promo') depoda sayılır ama
--     satılmaz: katalog, pazaryeri ve satılabilir stok dışıdır.
-- Idempotent: tekrar çalıştırmak güvenlidir.

-- 1. materials.type += 'promo' ------------------------------------------------

alter table public.materials
  drop constraint if exists materials_type_check;
alter table public.materials
  add constraint materials_type_check
  check (type in ('raw', 'semi', 'finished', 'promo'));

-- 2. location_depots: her konumun bağlı olduğu depo ------------------------------

create or replace view public.location_depots
with (security_invoker = true) as
select
  loc.id as location_id,
  loc.company_id,
  coalesce(parent.id, loc.id) as depot_id,
  coalesce(parent.is_default, loc.is_default) as depot_is_default
from public.locations loc
left join public.locations parent
  on parent.id = loc.parent_id and loc.kind = 'shelf'
where loc.deleted_at is null;

grant select on public.location_depots to authenticated;

-- 3. sellable_lots: satış deposundaki serbest, satılabilir lotlar ----------------

create or replace view public.sellable_lots
with (security_invoker = true) as
select
  l.id,
  l.company_id,
  l.material_id,
  m.type as material_type,
  l.lot_number,
  l.quantity_on_hand,
  l.expiry_date,
  l.owner_customer_id,
  l.location_id,
  l.created_at
from public.material_lots l
join public.materials m on m.id = l.material_id and m.deleted_at is null
join public.location_depots ld on ld.location_id = l.location_id
where l.deleted_at is null
  and l.status = 'released'
  and l.quantity_on_hand > 0
  and ld.depot_is_default = false
  and m.type <> 'promo';

grant select on public.sellable_lots to authenticated;

-- 4. buyer_catalog: stok kovası satış deposundan hesaplanır ---------------------

drop view if exists public.buyer_catalog;
create view public.buyer_catalog
with (security_invoker = false) as
select
  pc.company_id,
  pc.material_id,
  m.code,
  m.name,
  m.barcode,
  m.base_uom,
  pc.sale_price,
  (
    select rp.image_url
    from public.marketplace_remote_products rp
    where rp.company_id = pc.company_id
      and rp.channel = 'trendyol'
      and rp.barcode = m.barcode
    limit 1
  ) as image_url,
  case
    when coalesce(stk.on_hand, 0) <= 0 then 'out'
    when coalesce(stk.on_hand, 0) < pc.low_stock_threshold then 'low'
    else 'in'
  end as availability
from public.product_catalog pc
join public.materials m
  on m.id = pc.material_id and m.deleted_at is null
left join lateral (
  select sum(sl.quantity_on_hand) as on_hand
  from public.sellable_lots sl
  where sl.material_id = pc.material_id
    and sl.company_id = pc.company_id
    and sl.owner_customer_id is null
) stk on true
where pc.is_listed = true
  and pc.deleted_at is null
  and pc.company_id in (
    select company_id from public.customer_users
    where user_id = auth.uid() and deleted_at is null
  );

grant select on public.buyer_catalog to authenticated;
