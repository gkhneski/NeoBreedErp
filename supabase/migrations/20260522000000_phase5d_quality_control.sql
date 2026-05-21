-- =============================================================================
-- Phase 5d — Quality Control
-- Contract: docs/DATABASE_CONTRACT.md §13
-- =============================================================================
-- Adds:
--   * public.quality_checks         (per-company QC header; subject = lot|batch)
--   * public.quality_check_results  (per-check line items)
--   * Triggers:
--       - quality_checks_set_updated_at
--       - quality_checks_check_parents      (same-company guard for lot/batch)
--       - quality_check_results_set_updated_at
--       - quality_check_results_check_parents
--       - quality_check_results_block_when_signed (freeze results post-sign)
--   * RPCs (security invoker, RLS applies):
--       - sign_quality_check(...)   (draft -> passed|failed + lot/batch side-effects)
--       - cancel_quality_check(...) (draft -> cancelled)
-- Idempotent: safe to re-run.
-- =============================================================================

-- 1. quality_checks -------------------------------------------------------------

create table if not exists public.quality_checks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  subject_kind text not null
    check (subject_kind in ('material_lot', 'production_batch')),
  material_lot_id uuid references public.material_lots(id) on delete restrict,
  production_batch_id uuid references public.production_batches(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'passed', 'failed', 'cancelled')),
  signed_by uuid references auth.users(id) on delete set null,
  signed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint quality_checks_subject_consistency check (
    (subject_kind = 'material_lot'
      and material_lot_id is not null
      and production_batch_id is null)
    or
    (subject_kind = 'production_batch'
      and production_batch_id is not null
      and material_lot_id is null)
  )
);

drop trigger if exists quality_checks_set_updated_at on public.quality_checks;
create trigger quality_checks_set_updated_at
  before update on public.quality_checks
  for each row execute function public.set_updated_at();

create index if not exists quality_checks_company_id_idx
  on public.quality_checks(company_id);
create unique index if not exists quality_checks_company_code_unique
  on public.quality_checks(company_id, code)
  where deleted_at is null;
create index if not exists quality_checks_company_status_idx
  on public.quality_checks(company_id, status);
create index if not exists quality_checks_lot_idx
  on public.quality_checks(material_lot_id);
create index if not exists quality_checks_batch_idx
  on public.quality_checks(production_batch_id);
create index if not exists quality_checks_signed_at_idx
  on public.quality_checks(company_id, signed_at desc);
create index if not exists quality_checks_deleted_at_idx
  on public.quality_checks(deleted_at);

alter table public.quality_checks enable row level security;

drop policy if exists quality_checks_select_member on public.quality_checks;
create policy quality_checks_select_member on public.quality_checks
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists quality_checks_modify_member on public.quality_checks;
create policy quality_checks_modify_member on public.quality_checks
  for all
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  )
  with check (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

create or replace function public.quality_checks_check_parents()
returns trigger
language plpgsql
as $$
declare
  v_lot_company uuid;
  v_batch_company uuid;
begin
  if new.material_lot_id is not null then
    select company_id into v_lot_company
    from public.material_lots
    where id = new.material_lot_id;

    if v_lot_company is null then
      raise exception 'material_lot_id % does not exist', new.material_lot_id
        using errcode = '23503';
    end if;

    if v_lot_company <> new.company_id then
      raise exception 'material_lot_id % belongs to a different company',
        new.material_lot_id
        using errcode = '23514';
    end if;
  end if;

  if new.production_batch_id is not null then
    select company_id into v_batch_company
    from public.production_batches
    where id = new.production_batch_id;

    if v_batch_company is null then
      raise exception 'production_batch_id % does not exist',
        new.production_batch_id
        using errcode = '23503';
    end if;

    if v_batch_company <> new.company_id then
      raise exception 'production_batch_id % belongs to a different company',
        new.production_batch_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists quality_checks_check_parents on public.quality_checks;
create trigger quality_checks_check_parents
  before insert or update of
    company_id, subject_kind, material_lot_id, production_batch_id
  on public.quality_checks
  for each row execute function public.quality_checks_check_parents();

-- 2. quality_check_results ------------------------------------------------------

create table if not exists public.quality_check_results (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  quality_check_id uuid not null
    references public.quality_checks(id) on delete cascade,
  position int not null,
  spec_name text not null,
  spec_target text,
  measured_value text,
  verdict text not null default 'pending'
    check (verdict in ('pending', 'pass', 'fail', 'na')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists quality_check_results_set_updated_at on public.quality_check_results;
create trigger quality_check_results_set_updated_at
  before update on public.quality_check_results
  for each row execute function public.set_updated_at();

create index if not exists quality_check_results_company_id_idx
  on public.quality_check_results(company_id);
create index if not exists quality_check_results_check_idx
  on public.quality_check_results(quality_check_id);
create unique index if not exists quality_check_results_check_position_unique
  on public.quality_check_results(quality_check_id, position);

alter table public.quality_check_results enable row level security;

drop policy if exists quality_check_results_select_member on public.quality_check_results;
create policy quality_check_results_select_member on public.quality_check_results
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists quality_check_results_modify_member on public.quality_check_results;
create policy quality_check_results_modify_member on public.quality_check_results
  for all
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  )
  with check (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

create or replace function public.quality_check_results_check_parents()
returns trigger
language plpgsql
as $$
declare
  v_parent_company uuid;
begin
  select company_id into v_parent_company
  from public.quality_checks
  where id = new.quality_check_id;

  if v_parent_company is null then
    raise exception 'quality_check_id % does not exist', new.quality_check_id
      using errcode = '23503';
  end if;

  if v_parent_company <> new.company_id then
    raise exception 'quality_check_id % belongs to a different company',
      new.quality_check_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists quality_check_results_check_parents on public.quality_check_results;
create trigger quality_check_results_check_parents
  before insert or update of company_id, quality_check_id
  on public.quality_check_results
  for each row execute function public.quality_check_results_check_parents();

-- Freeze: once a parent check is signed (passed|failed), block ALL mutations
-- on its result rows. Cancelled / deleted parents are also frozen.
create or replace function public.quality_check_results_block_when_signed()
returns trigger
language plpgsql
as $$
declare
  v_parent_status text;
  v_check_id uuid;
begin
  if tg_op = 'DELETE' then
    v_check_id := old.quality_check_id;
  else
    v_check_id := new.quality_check_id;
  end if;

  select status into v_parent_status
  from public.quality_checks
  where id = v_check_id;

  if v_parent_status is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if v_parent_status <> 'draft' then
    raise exception
      'quality check % is %; results are frozen', v_check_id, v_parent_status
      using errcode = '23514';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists quality_check_results_freeze on public.quality_check_results;
create trigger quality_check_results_freeze
  before insert or update or delete on public.quality_check_results
  for each row execute function public.quality_check_results_block_when_signed();

-- 3. RPC: sign_quality_check ----------------------------------------------------

create or replace function public.sign_quality_check(
  p_company_id uuid,
  p_check_id uuid,
  p_overall_verdict text
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_check record;
  v_user uuid := auth.uid();
  v_pending_count int;
  v_blank_value_count int;
  v_fail_count int;
  v_lot_status text;
  v_lot_company uuid;
  v_batch record;
  v_output_lot_status text;
  v_new_lot_status text;
begin
  if p_overall_verdict not in ('passed', 'failed') then
    raise exception 'overall verdict must be passed or failed (got %)',
      p_overall_verdict
      using errcode = '23514';
  end if;

  select id, company_id, status, subject_kind,
         material_lot_id, production_batch_id
    into v_check
  from public.quality_checks
  where id = p_check_id
    and company_id = p_company_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'quality check % not found in this company', p_check_id
      using errcode = '23503';
  end if;

  if v_check.status <> 'draft' then
    raise exception 'quality check % is % (must be draft to sign)',
      p_check_id, v_check.status
      using errcode = '23514';
  end if;

  -- Result row validation
  select count(*) into v_pending_count
  from public.quality_check_results
  where quality_check_id = p_check_id and verdict = 'pending';

  if v_pending_count > 0 then
    raise exception
      'quality check % has % pending result row(s); fill verdicts before signing',
      p_check_id, v_pending_count
      using errcode = '23514';
  end if;

  select count(*) into v_blank_value_count
  from public.quality_check_results
  where quality_check_id = p_check_id
    and (measured_value is null or btrim(measured_value) = '');

  if v_blank_value_count > 0 then
    raise exception
      'quality check % has % result row(s) without a measured value',
      p_check_id, v_blank_value_count
      using errcode = '23514';
  end if;

  if p_overall_verdict = 'passed' then
    select count(*) into v_fail_count
    from public.quality_check_results
    where quality_check_id = p_check_id and verdict = 'fail';

    if v_fail_count > 0 then
      raise exception
        'cannot sign as passed: % result row(s) marked fail', v_fail_count
        using errcode = '23514';
    end if;
  end if;

  -- Subject side-effects
  v_new_lot_status := case
    when p_overall_verdict = 'passed' then 'released'
    else 'blocked'
  end;

  if v_check.subject_kind = 'material_lot' then
    select status, company_id
      into v_lot_status, v_lot_company
    from public.material_lots
    where id = v_check.material_lot_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'material lot % not found', v_check.material_lot_id
        using errcode = '23503';
    end if;

    if v_lot_company <> p_company_id then
      raise exception 'material lot % belongs to a different company',
        v_check.material_lot_id
        using errcode = '23514';
    end if;

    if v_lot_status <> 'quarantine' then
      raise exception
        'material lot % is %; QC can only sign a lot in quarantine',
        v_check.material_lot_id, v_lot_status
        using errcode = '23514';
    end if;

    update public.material_lots
       set status = v_new_lot_status,
           updated_by = v_user
     where id = v_check.material_lot_id;

  elsif v_check.subject_kind = 'production_batch' then
    select id, company_id, status, output_lot_id
      into v_batch
    from public.production_batches
    where id = v_check.production_batch_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'production batch % not found', v_check.production_batch_id
        using errcode = '23503';
    end if;

    if v_batch.company_id <> p_company_id then
      raise exception 'production batch % belongs to a different company',
        v_check.production_batch_id
        using errcode = '23514';
    end if;

    if v_batch.status <> 'completed' then
      raise exception
        'production batch % is %; QC requires completed batch',
        v_check.production_batch_id, v_batch.status
        using errcode = '23514';
    end if;

    if v_batch.output_lot_id is null then
      raise exception
        'production batch % has no output lot to release',
        v_check.production_batch_id
        using errcode = '23514';
    end if;

    select status into v_output_lot_status
    from public.material_lots
    where id = v_batch.output_lot_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'output lot % not found', v_batch.output_lot_id
        using errcode = '23503';
    end if;

    if v_output_lot_status <> 'quarantine' then
      raise exception
        'output lot % is %; QC can only sign a lot in quarantine',
        v_batch.output_lot_id, v_output_lot_status
        using errcode = '23514';
    end if;

    update public.material_lots
       set status = v_new_lot_status,
           updated_by = v_user
     where id = v_batch.output_lot_id;

    if p_overall_verdict = 'passed' then
      update public.production_batches
         set status = 'closed',
             closed_at = now(),
             updated_by = v_user
       where id = v_batch.id;

      update public.production_orders
         set status = 'closed',
             closed_at = now(),
             updated_by = v_user
       where id = (select production_order_id
                     from public.production_batches
                    where id = v_batch.id);
    end if;
  end if;

  update public.quality_checks
     set status = case
                    when p_overall_verdict = 'passed' then 'passed'
                    else 'failed'
                  end,
         signed_by = v_user,
         signed_at = now(),
         updated_by = v_user
   where id = p_check_id;

  return p_check_id;
end;
$$;

grant execute on function public.sign_quality_check(uuid, uuid, text)
  to authenticated;

-- 4. RPC: cancel_quality_check --------------------------------------------------

create or replace function public.cancel_quality_check(
  p_company_id uuid,
  p_check_id uuid
)
returns void
language plpgsql
security invoker
as $$
declare
  v_status text;
  v_user uuid := auth.uid();
begin
  select status into v_status
  from public.quality_checks
  where id = p_check_id
    and company_id = p_company_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'quality check % not found in this company', p_check_id
      using errcode = '23503';
  end if;

  if v_status <> 'draft' then
    raise exception
      'quality check % is %; only draft checks can be cancelled',
      p_check_id, v_status
      using errcode = '23514';
  end if;

  update public.quality_checks
     set status = 'cancelled',
         deleted_at = now(),
         updated_by = v_user
   where id = p_check_id;
end;
$$;

grant execute on function public.cancel_quality_check(uuid, uuid)
  to authenticated;
