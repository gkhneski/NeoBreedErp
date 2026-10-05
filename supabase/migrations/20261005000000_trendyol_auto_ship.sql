-- Trendyol otomatik sevkiyat: pazaryeri "kargoya verildi" dediğinde ERP
-- sevkiyatı kendisi açar, FEFO (en yakın SKT) ile satış deposundaki serbest
-- lotlardan düşer ve sevkiyatı kapatır. Düşemediği sipariş "istisna" olur.
--
-- İş kuralı (owner, 2026-10-05):
--   * Depocu Trendyol siparişi için elle sevkiyat açmaz; yalnızca istisnalara bakar.
--   * Otomatik düşüm firma bazında kapalı başlar (auto_ship=false). Açıldığı an
--     kaydedilir; yalnızca o andan sonraki siparişler düşülür (geçmiş siparişler
--     sayımdan önce kargolandığı için stokta zaten yoktur).
--   * Depocu aynı sipariş için elle sevkiyat açmışsa ikinci kez düşülmez.
--   * İptal/iade olan ve düşülmüş sipariş depocu onayıyla stoğa geri alınır.
-- Idempotent: tekrar çalıştırmak güvenlidir.

-- 1. marketplace_connections: firma bazında anahtar -----------------------------

alter table public.marketplace_connections
  add column if not exists auto_ship boolean not null default false,
  add column if not exists auto_ship_enabled_at timestamptz;

-- 2. marketplace_orders: ERP sevkiyat bağı ve otomatik düşüm sonucu ------------

alter table public.marketplace_orders
  add column if not exists shipment_id uuid references public.shipments(id) on delete set null,
  add column if not exists auto_ship_status text,
  add column if not exists auto_ship_error text,
  add column if not exists auto_ship_at timestamptz;

alter table public.marketplace_orders
  drop constraint if exists marketplace_orders_auto_ship_status_check;
alter table public.marketplace_orders
  add constraint marketplace_orders_auto_ship_status_check
  check (auto_ship_status is null or auto_ship_status in ('shipped', 'manual', 'failed', 'returned'));

create index if not exists marketplace_orders_company_auto_ship_failed_idx
  on public.marketplace_orders(company_id, channel)
  where auto_ship_status = 'failed';

create index if not exists marketplace_orders_shipment_idx
  on public.marketplace_orders(shipment_id)
  where shipment_id is not null;

-- Barkod → ürün: önce pazaryeri eşlemesi, yoksa ürün kartındaki barkod.
create or replace function public.resolve_marketplace_material(
  p_company_id uuid,
  p_channel text,
  p_barcode text
)
returns uuid
language sql
stable
security invoker
as $$
  select coalesce(
    (
      select ml.material_id
      from public.marketplace_listings ml
      where ml.company_id = p_company_id
        and ml.channel = p_channel
        and ml.barcode = p_barcode
        and ml.deleted_at is null
      limit 1
    ),
    (
      select m.id
      from public.materials m
      where m.company_id = p_company_id
        and m.barcode = p_barcode
        and m.type = 'finished'
        and m.deleted_at is null
      limit 1
    )
  )
$$;

-- 3. RPC: tek siparişi otomatik sevk et ---------------------------------------
--
-- Dönen değer: 'shipped' | 'manual' (depocunun elle açtığı sevkiyata bağlandı)
-- | 'already' (daha önce bağlanmış). Düşülemiyorsa Türkçe mesajla exception
-- atar (23514); çağıran taraf mesajı auto_ship_error'a yazar. Tüm doğrulama
-- önce yapılır; sevkiyat ancak her kalem karşılanabiliyorsa açılır.
--
-- Yalnızca sunucu (service_role, cron) çağırır; authenticated'a verilmez.

create or replace function public.auto_ship_marketplace_order(
  p_company_id uuid,
  p_channel text,
  p_order_number text
)
returns text
language plpgsql
security invoker
as $$
declare
  v_order record;
  v_existing uuid;
  v_line record;
  v_material uuid;
  v_have numeric(18, 6);
  v_need numeric(18, 6);
  v_take numeric(18, 6);
  v_lot record;
  v_shipment_id uuid;
  v_max integer;
  v_code text;
begin
  select id, lines, customer_name, shipment_id
    into v_order
  from public.marketplace_orders
  where company_id = p_company_id
    and channel = p_channel
    and order_number = p_order_number
  for update;

  if not found then
    raise exception 'order % not found', p_order_number using errcode = 'P0002';
  end if;

  if v_order.shipment_id is not null then
    return 'already';
  end if;

  select id into v_existing
  from public.shipments
  where company_id = p_company_id
    and channel = p_channel
    and external_order_no = p_order_number
    and deleted_at is null
    and status <> 'cancelled'
  order by created_at desc
  limit 1;

  if v_existing is not null then
    update public.marketplace_orders
       set shipment_id = v_existing,
           auto_ship_status = 'manual',
           auto_ship_error = null,
           auto_ship_at = now()
     where id = v_order.id;
    return 'manual';
  end if;

  if v_order.lines is null
     or jsonb_typeof(v_order.lines) <> 'array'
     or jsonb_array_length(v_order.lines) = 0 then
    raise exception 'Siparişte ürün kalemi yok' using errcode = '23514';
  end if;

  -- Doğrulama: her barkod bir ürüne eşli ve satılabilir stok yeterli mi?
  for v_line in
    select
      coalesce(l ->> 'barcode', '') as barcode,
      max(coalesce(l ->> 'name', '')) as name,
      sum(coalesce((l ->> 'quantity')::numeric, 0)) as qty
    from jsonb_array_elements(v_order.lines) l
    group by 1
  loop
    if v_line.qty <= 0 then
      continue;
    end if;

    v_material := public.resolve_marketplace_material(p_company_id, p_channel, v_line.barcode);
    if v_material is null then
      raise exception 'Barkod ürüne eşli değil: % (%)', v_line.barcode, v_line.name
        using errcode = '23514';
    end if;

    select coalesce(sum(quantity_on_hand), 0) into v_have
    from public.sellable_lots
    where company_id = p_company_id
      and material_id = v_material
      and owner_customer_id is null;

    if v_have < v_line.qty then
      raise exception 'Yetersiz satılabilir stok: % (gerekli %, mevcut %)',
        v_line.name, v_line.qty, v_have
        using errcode = '23514';
    end if;
  end loop;

  -- Sevkiyat kodu: uygulamadaki SVK-nnnnnn sırasını paylaşır.
  select coalesce(max((regexp_match(code, '^SVK-(\d+)$'))[1]::integer), 0)
    into v_max
  from public.shipments
  where company_id = p_company_id;
  v_code := 'SVK-' || lpad((v_max + 1)::text, 6, '0');

  insert into public.shipments (
    company_id, code, channel, external_order_no, recipient, notes, status
  )
  values (
    p_company_id, v_code, p_channel, p_order_number,
    nullif(v_order.customer_name, ''),
    'Pazaryeri otomatik sevkiyat (kargoya verildi bilgisinden)',
    'open'
  )
  returning id into v_shipment_id;

  -- Tahsis: FEFO — en yakın SKT'li serbest lot önce, SKT'siz lotlar en sona.
  for v_line in
    select
      coalesce(l ->> 'barcode', '') as barcode,
      max(coalesce(l ->> 'name', '')) as name,
      sum(coalesce((l ->> 'quantity')::numeric, 0)) as qty
    from jsonb_array_elements(v_order.lines) l
    group by 1
  loop
    if v_line.qty <= 0 then
      continue;
    end if;

    v_material := public.resolve_marketplace_material(p_company_id, p_channel, v_line.barcode);
    v_need := v_line.qty;

    for v_lot in
      select id, quantity_on_hand
      from public.sellable_lots
      where company_id = p_company_id
        and material_id = v_material
        and owner_customer_id is null
      order by expiry_date asc nulls last, created_at asc
    loop
      exit when v_need <= 0;
      v_take := least(v_lot.quantity_on_hand, v_need);
      insert into public.shipment_items (
        company_id, shipment_id, lot_id, material_id, quantity
      )
      values (p_company_id, v_shipment_id, v_lot.id, v_material, v_take);
      v_need := v_need - v_take;
    end loop;

    if v_need > 0 then
      raise exception 'Yetersiz satılabilir stok: % (eksik %)', v_line.name, v_need
        using errcode = '23514';
    end if;
  end loop;

  perform public.ship_shipment(p_company_id, v_shipment_id);

  update public.marketplace_orders
     set shipment_id = v_shipment_id,
         auto_ship_status = 'shipped',
         auto_ship_error = null,
         auto_ship_at = now()
   where id = v_order.id;

  return 'shipped';
end;
$$;

revoke all on function public.auto_ship_marketplace_order(uuid, text, text) from public;
revoke all on function public.auto_ship_marketplace_order(uuid, text, text) from authenticated;
grant execute on function public.auto_ship_marketplace_order(uuid, text, text) to service_role;

revoke all on function public.resolve_marketplace_material(uuid, text, text) from public;
grant execute on function public.resolve_marketplace_material(uuid, text, text) to authenticated, service_role;

-- 4. RPC: gönderilmiş sevkiyatı stoğa geri al (iade / iptal) ------------------
--
-- Sevkiyatın her çıkış hareketini storno eder (reverse_stock_movement); sevkiyat
-- satırı değişmez (gönderilenler değiştirilemez), yalnızca defter geri döner.
-- security invoker: RLS uygulanır, depocu (SHIPMENT_WRITE_ROLES) çağırır.

create or replace function public.return_shipment_to_stock(
  p_company_id uuid,
  p_shipment_id uuid,
  p_reason text default null
)
returns integer
language plpgsql
security invoker
as $$
declare
  v_shipment record;
  v_movement record;
  v_count integer := 0;
begin
  select id, code, status into v_shipment
  from public.shipments
  where id = p_shipment_id
    and company_id = p_company_id
    and deleted_at is null;

  if not found then
    raise exception 'shipment % not found', p_shipment_id using errcode = 'P0002';
  end if;

  if v_shipment.status <> 'shipped' then
    raise exception 'only shipped shipments can be returned (status: %)', v_shipment.status
      using errcode = '23514';
  end if;

  for v_movement in
    select sm.id
    from public.stock_movements sm
    where sm.company_id = p_company_id
      and sm.kind = 'issue'
      and sm.notes = 'shipment ' || v_shipment.code
      and sm.reverses_movement_id is null
      and sm.lot_id in (
        select lot_id from public.shipment_items where shipment_id = p_shipment_id
      )
      and not exists (
        select 1 from public.stock_movements r where r.reverses_movement_id = sm.id
      )
  loop
    perform public.reverse_stock_movement(
      p_company_id,
      v_movement.id,
      coalesce(p_reason, 'Pazaryeri iade/iptal – depoya geri alındı')
    );
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'shipment % has no reversible movements', v_shipment.code
      using errcode = '23514';
  end if;

  return v_count;
end;
$$;

grant execute on function public.return_shipment_to_stock(uuid, uuid, text) to authenticated, service_role;
