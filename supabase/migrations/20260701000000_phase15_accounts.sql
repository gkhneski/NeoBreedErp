-- Phase 15: Unified current-account ledger (cari / AR-AP).
--
-- One table for both customer receivables and supplier payables. amount is a
-- SIGNED delta; party balance = sum(amount). For a customer, balance > 0 means
-- the customer owes us (receivable). For a supplier, balance > 0 means we owe
-- the supplier (payable). Sales/receipts post +amount; payments post -amount.

create table if not exists public.account_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  party_type text not null check (party_type in ('customer', 'supplier')),
  party_id uuid not null,
  kind text not null check (kind in ('sale', 'purchase', 'payment', 'adjustment')),
  amount numeric(14,2) not null,
  currency text not null default 'TRY',
  occurred_at timestamptz not null default now(),
  doc_no text,
  doc_date date,
  reference_kind text,
  reference_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists account_transactions_company_idx on public.account_transactions(company_id);
create index if not exists account_transactions_party_idx
  on public.account_transactions(company_id, party_type, party_id);
-- Idempotency for auto-posted events (e.g. a sale per order, a payable per PO).
create unique index if not exists account_transactions_reference_unique
  on public.account_transactions(company_id, reference_kind, reference_id, kind)
  where reference_id is not null;

alter table public.account_transactions enable row level security;

drop policy if exists account_transactions_select_member on public.account_transactions;
create policy account_transactions_select_member on public.account_transactions
  for select using (
    company_id in (
      select company_id from public.company_users
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists account_transactions_modify_member on public.account_transactions;
create policy account_transactions_modify_member on public.account_transactions
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
