-- =============================================================================
-- Per-company audit log + production order deletion
-- Contract: docs/DATABASE_CONTRACT.md §12.3, docs/SECURITY_RULES.md §9
-- =============================================================================
-- Adds:
--   * public.audit_log                  (per-company, append-only protocol)
--   * RPC delete_production_order(...)  (soft-deletes a mis-entered order and
--                                        its open batch, writes the protocol
--                                        row in the same transaction)
-- Only orders without stock impact can be deleted: a completed/closed batch,
-- a batch-linked stock movement or a batch QC check blocks the deletion.
-- Idempotent: safe to re-run.
-- =============================================================================

-- 1. audit_log -------------------------------------------------------------------

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_table text,
  target_id text,
  target_label text,
  reason text,
  diff jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_company_created_at_idx
  on public.audit_log(company_id, created_at desc);
create index if not exists audit_log_company_target_idx
  on public.audit_log(company_id, target_table, target_id);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_select_member on public.audit_log;
create policy audit_log_select_member on public.audit_log
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

-- Append-only: insert only, and only as yourself. No update/delete policy.
drop policy if exists audit_log_insert_member on public.audit_log;
create policy audit_log_insert_member on public.audit_log
  for insert
  with check (
    actor_id = auth.uid()
    and company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

create or replace function public.audit_log_block_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only' using errcode = '23514';
end;
$$;

drop trigger if exists audit_log_block_update on public.audit_log;
create trigger audit_log_block_update
  before update on public.audit_log
  for each row execute function public.audit_log_block_mutation();

drop trigger if exists audit_log_block_delete on public.audit_log;
create trigger audit_log_block_delete
  before delete on public.audit_log
  for each row execute function public.audit_log_block_mutation();

-- 2. RPC: delete_production_order ------------------------------------------------

create or replace function public.delete_production_order(
  p_company_id uuid,
  p_order_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_order record;
  v_user uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_batch_numbers text[];
  v_audit_id uuid;
begin
  if v_reason is null then
    raise exception 'reason is required' using errcode = '23514';
  end if;

  select o.id, o.code, o.status, o.planned_quantity, o.planned_uom,
         o.planned_start_at, o.planned_end_at, o.started_at, o.notes,
         o.finished_material_id, o.recipe_id, o.customer_id,
         m.code as material_code, m.name as material_name,
         r.code as recipe_code, r.version as recipe_version,
         c.name as customer_name
    into v_order
  from public.production_orders o
  left join public.materials m on m.id = o.finished_material_id
  left join public.recipes r on r.id = o.recipe_id
  left join public.customers c on c.id = o.customer_id
  where o.id = p_order_id
    and o.company_id = p_company_id
    and o.deleted_at is null
  for update of o;

  if not found then
    raise exception 'production order % not found in this company', p_order_id
      using errcode = '23503';
  end if;

  if v_order.status in ('completed', 'closed') then
    raise exception 'order is % and cannot be deleted', v_order.status
      using errcode = '23514';
  end if;

  if exists (
    select 1 from public.production_batches b
    where b.production_order_id = v_order.id
      and b.company_id = p_company_id
      and b.deleted_at is null
      and (
        b.status in ('completed', 'closed')
        or b.output_lot_id is not null
        or exists (
          select 1 from public.stock_movements sm where sm.batch_id = b.id
        )
        or exists (
          select 1 from public.quality_checks qc
          where qc.production_batch_id = b.id and qc.deleted_at is null
        )
      )
  ) then
    raise exception 'order has batches with stock or quality records'
      using errcode = '23514';
  end if;

  select array_agg(b.batch_number order by b.started_at)
    into v_batch_numbers
  from public.production_batches b
  where b.production_order_id = v_order.id
    and b.company_id = p_company_id
    and b.deleted_at is null;

  update public.production_batches
     set status = 'cancelled',
         cancelled_at = coalesce(cancelled_at, now()),
         deleted_at = now(),
         updated_by = v_user
   where production_order_id = v_order.id
     and company_id = p_company_id
     and deleted_at is null;

  update public.production_orders
     set deleted_at = now(),
         updated_by = v_user
   where id = v_order.id;

  insert into public.audit_log (
    company_id, actor_id, action, target_table, target_id, target_label,
    reason, diff
  )
  values (
    p_company_id, v_user, 'delete_production_order', 'production_orders',
    v_order.id::text, v_order.code, v_reason,
    jsonb_build_object(
      'code', v_order.code,
      'status', v_order.status,
      'material_code', v_order.material_code,
      'material_name', v_order.material_name,
      'recipe_code', v_order.recipe_code,
      'recipe_version', v_order.recipe_version,
      'customer_name', v_order.customer_name,
      'planned_quantity', v_order.planned_quantity,
      'planned_uom', v_order.planned_uom,
      'planned_start_at', v_order.planned_start_at,
      'planned_end_at', v_order.planned_end_at,
      'started_at', v_order.started_at,
      'notes', v_order.notes,
      'batch_numbers', coalesce(to_jsonb(v_batch_numbers), '[]'::jsonb)
    )
  )
  returning id into v_audit_id;

  return v_audit_id;
end;
$$;

grant execute on function public.delete_production_order(uuid, uuid, text)
  to authenticated;
