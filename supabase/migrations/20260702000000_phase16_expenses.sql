-- Phase 16: Company overhead expenses + profitability inputs.
--
-- General running costs (salary, electricity, water, fuel, rent, other) are
-- entered per month and allocated to per-box product cost by produced-box count:
-- unit overhead = month expenses / total boxes produced that month.

create table if not exists public.company_expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  category text not null
    check (category in ('salary', 'electricity', 'water', 'fuel', 'rent', 'other')),
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'TRY',
  period_month date not null,
  occurred_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

drop trigger if exists company_expenses_set_updated_at on public.company_expenses;
create trigger company_expenses_set_updated_at
  before update on public.company_expenses
  for each row execute function public.set_updated_at();

create index if not exists company_expenses_company_idx on public.company_expenses(company_id);
create index if not exists company_expenses_period_idx
  on public.company_expenses(company_id, period_month);
create index if not exists company_expenses_deleted_at_idx on public.company_expenses(deleted_at);

alter table public.company_expenses enable row level security;

drop policy if exists company_expenses_select_member on public.company_expenses;
create policy company_expenses_select_member on public.company_expenses
  for select using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists company_expenses_modify_member on public.company_expenses;
create policy company_expenses_modify_member on public.company_expenses
  for all using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  ) with check (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );
