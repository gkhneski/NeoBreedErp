-- Phase 5 permissions: expand company-level role names.
-- `company_user` remains valid for existing/demo users and maps to broad MVP access.

alter table public.company_users
  drop constraint if exists company_users_role_check;

alter table public.company_users
  add constraint company_users_role_check
  check (
    role in (
      'company_admin',
      'production_manager',
      'quality_manager',
      'operator',
      'viewer',
      'company_user'
    )
  );
