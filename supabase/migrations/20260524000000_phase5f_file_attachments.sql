-- =============================================================================
-- Phase 5f — Per-company file storage (bucket + metadata table)
-- Contract: docs/DATABASE_CONTRACT.md §15
-- =============================================================================
-- Adds:
--   * Storage bucket `tenant-files` (private)
--   * storage.objects policies scoped to bucket_id = 'tenant-files'
--   * public.file_attachments  (polymorphic: material_lot | quality_check)
--   * Triggers:
--       - file_attachments_check_parents       (same-company guard for subject)
--       - file_attachments_check_storage_path  (path prefix invariant)
--       - file_attachments_block_path_mutation (immutability of identity cols)
-- Idempotent: safe to re-run.
-- =============================================================================

-- 1. Storage bucket ------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('tenant-files', 'tenant-files', false)
on conflict (id) do update set public = false;

-- 2. file_attachments table ----------------------------------------------------

create table if not exists public.file_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  subject_kind text not null
    check (subject_kind in ('material_lot', 'quality_check')),
  material_lot_id uuid references public.material_lots(id) on delete cascade,
  quality_check_id uuid references public.quality_checks(id) on delete cascade,
  kind text not null
    check (kind in ('coa', 'msds', 'invoice', 'lab_report', 'other')),
  storage_path text not null,
  file_name text not null check (length(file_name) between 1 and 255),
  mime_type text not null,
  size_bytes bigint not null
    check (size_bytes > 0 and size_bytes <= 26214400),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint file_attachments_subject_consistency check (
    (subject_kind = 'material_lot'
      and material_lot_id is not null
      and quality_check_id is null)
    or
    (subject_kind = 'quality_check'
      and quality_check_id is not null
      and material_lot_id is null)
  )
);

create index if not exists file_attachments_company_id_idx
  on public.file_attachments(company_id);
create index if not exists file_attachments_lot_idx
  on public.file_attachments(material_lot_id)
  where material_lot_id is not null;
create index if not exists file_attachments_check_idx
  on public.file_attachments(quality_check_id)
  where quality_check_id is not null;
create index if not exists file_attachments_company_kind_idx
  on public.file_attachments(company_id, kind);
create unique index if not exists file_attachments_storage_path_unique
  on public.file_attachments(storage_path);

alter table public.file_attachments enable row level security;

drop policy if exists file_attachments_select_member on public.file_attachments;
create policy file_attachments_select_member on public.file_attachments
  for select
  using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists file_attachments_modify_member on public.file_attachments;
create policy file_attachments_modify_member on public.file_attachments
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

-- 3. Cross-tenant + parent-consistency trigger --------------------------------

create or replace function public.file_attachments_check_parents()
returns trigger
language plpgsql
as $$
declare
  v_lot_company uuid;
  v_check_company uuid;
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

  if new.quality_check_id is not null then
    select company_id into v_check_company
    from public.quality_checks
    where id = new.quality_check_id;

    if v_check_company is null then
      raise exception 'quality_check_id % does not exist', new.quality_check_id
        using errcode = '23503';
    end if;

    if v_check_company <> new.company_id then
      raise exception 'quality_check_id % belongs to a different company',
        new.quality_check_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists file_attachments_check_parents on public.file_attachments;
create trigger file_attachments_check_parents
  before insert or update of
    company_id, subject_kind, material_lot_id, quality_check_id
  on public.file_attachments
  for each row execute function public.file_attachments_check_parents();

-- 4. Path-prefix invariant trigger --------------------------------------------

create or replace function public.file_attachments_check_storage_path()
returns trigger
language plpgsql
as $$
declare
  v_first_segment text;
begin
  if new.storage_path is null or new.storage_path = '' then
    raise exception 'storage_path is required' using errcode = '23514';
  end if;

  v_first_segment := split_part(new.storage_path, '/', 1);

  if v_first_segment = '' or v_first_segment <> new.company_id::text then
    raise exception
      'storage_path % must start with the row company_id (%)',
      new.storage_path, new.company_id
      using errcode = '23514';
  end if;

  -- Require at least company_id/domain/subject_id/filename → 3 separators.
  if array_length(string_to_array(new.storage_path, '/'), 1) < 4 then
    raise exception
      'storage_path % must contain at least 4 segments (company_id/domain/subject_id/file)',
      new.storage_path
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists file_attachments_check_storage_path on public.file_attachments;
create trigger file_attachments_check_storage_path
  before insert or update of storage_path, company_id
  on public.file_attachments
  for each row execute function public.file_attachments_check_storage_path();

-- 5. Immutability trigger -----------------------------------------------------
-- Identity columns are frozen post-insert; only `kind` and `notes` mutate.

create or replace function public.file_attachments_block_path_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.storage_path is distinct from old.storage_path then
    raise exception 'storage_path is immutable' using errcode = '23514';
  end if;
  if new.company_id is distinct from old.company_id then
    raise exception 'company_id is immutable' using errcode = '23514';
  end if;
  if new.subject_kind is distinct from old.subject_kind then
    raise exception 'subject_kind is immutable' using errcode = '23514';
  end if;
  if new.material_lot_id is distinct from old.material_lot_id then
    raise exception 'material_lot_id is immutable' using errcode = '23514';
  end if;
  if new.quality_check_id is distinct from old.quality_check_id then
    raise exception 'quality_check_id is immutable' using errcode = '23514';
  end if;
  if new.size_bytes is distinct from old.size_bytes then
    raise exception 'size_bytes is immutable' using errcode = '23514';
  end if;
  if new.mime_type is distinct from old.mime_type then
    raise exception 'mime_type is immutable' using errcode = '23514';
  end if;
  if new.file_name is distinct from old.file_name then
    raise exception 'file_name is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists file_attachments_block_path_mutation on public.file_attachments;
create trigger file_attachments_block_path_mutation
  before update on public.file_attachments
  for each row execute function public.file_attachments_block_path_mutation();

-- 6. storage.objects RLS policies for `tenant-files` --------------------------
-- First path segment must equal a company_id the caller is a member of.
-- We scope every policy to bucket_id so policies on other buckets are unaffected.

drop policy if exists tenant_files_select_member on storage.objects;
create policy tenant_files_select_member on storage.objects
  for select
  using (
    bucket_id = 'tenant-files'
    and split_part(name, '/', 1) in (
      select company_id::text from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists tenant_files_insert_member on storage.objects;
create policy tenant_files_insert_member on storage.objects
  for insert
  with check (
    bucket_id = 'tenant-files'
    and split_part(name, '/', 1) in (
      select company_id::text from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists tenant_files_update_member on storage.objects;
create policy tenant_files_update_member on storage.objects
  for update
  using (
    bucket_id = 'tenant-files'
    and split_part(name, '/', 1) in (
      select company_id::text from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  )
  with check (
    bucket_id = 'tenant-files'
    and split_part(name, '/', 1) in (
      select company_id::text from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists tenant_files_delete_member on storage.objects;
create policy tenant_files_delete_member on storage.objects
  for delete
  using (
    bucket_id = 'tenant-files'
    and split_part(name, '/', 1) in (
      select company_id::text from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );
