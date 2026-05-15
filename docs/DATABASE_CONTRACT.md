# DATABASE_CONTRACT.md

The canonical contract for the Supabase Postgres schema. **No migration may be written that violates this contract.** When the contract and a migration disagree, the contract is right and the migration is wrong.

This document is updated *before* a table is built, not after.

---

## 1. Global Rules

1. **Every operational table carries `company_id uuid not null`** referencing `public.companies(id)` `on delete restrict`.
2. **Every table has Row Level Security enabled before it accepts any row.** No exceptions.
3. **Primary keys** are `uuid` generated via `gen_random_uuid()` unless a table is a pure junction with composite PK.
4. **Timestamps:** every table has `created_at timestamptz not null default now()` and `updated_at timestamptz not null default now()` with a trigger that bumps `updated_at`.
5. **Soft deletes** are opt-in per table via `deleted_at timestamptz null`. Default is hard delete; document if a table uses soft delete and why.
6. **`created_by uuid` and `updated_by uuid`** reference `auth.users(id)` `on delete set null` on tables where audit matters (everything operational).
7. **Naming:** `snake_case` everywhere. Tables are plural (`companies`, `recipes`, `production_orders`). Columns are singular nouns.
8. **Foreign keys** always declare `on delete` behavior explicitly. No implicit cascades on operational data.
9. **Money / quantities** use `numeric(18, 6)` for stock quantities and `numeric(18, 4)` for monetary amounts. Never `float`.
10. **Currency** stored as ISO 4217 string (e.g., `TRY`, `EUR`) on the company or transaction record — no implicit currency.
11. **Indexes:** every `company_id` column is indexed; every foreign key column is indexed; hot query columns (status, dates) are indexed in their phase, not preemptively.
12. **Enums** are Postgres `text` columns with a `check (value in (...))` constraint, **not** Postgres `enum` types (easier to migrate).

---

## 2. Table Categories

### 2.1 Platform tables (no `company_id`)
- `companies` — the tenants themselves.
- `packages` (plans) — pricing/limits templates.
- `platform_admins` — who is Super Admin.
- `platform_audit_log` — Super Admin actions.

These tables are readable only by Super Admins (RLS) and writable only by Super Admin operations (server-side, service role or RLS-permitted role).

### 2.2 Membership tables
- `profiles` — mirrors `auth.users` with display data.
- `company_users` — links users to companies with a role. **Has `company_id`.** A user may belong to multiple companies (future-proof), but the active company is one at a time.

### 2.3 Operational tables (per company)
All must carry `company_id`. Examples (each gets its own contract section before being built):
- `recipes`, `recipe_items`
- `materials` (raw + finished), `material_lots`
- `stock_movements`
- `production_orders`, `production_batches`
- `quality_checks`, `quality_check_results`
- `cost_snapshots`

The exact shape of each is added to this document **before** its migration is authored.

---

## 3. RLS Pattern (canonical)

Every tenant table follows this pattern (template — exact SQL is written in the migration phase):

```
-- enable
alter table public.<table> enable row level security;

-- read: must be a member of the company
create policy "<table>_select" on public.<table>
  for select
  using (
    company_id in (select company_id from public.company_users where user_id = auth.uid())
  );

-- write: same membership, plus role check at app layer for sensitive writes
create policy "<table>_modify" on public.<table>
  for all
  using (
    company_id in (select company_id from public.company_users where user_id = auth.uid())
  )
  with check (
    company_id in (select company_id from public.company_users where user_id = auth.uid())
  );
```

Super Admin **does not** get a blanket bypass policy on operational tables. Platform-level service operations use the service role key on the server, and even then they should only touch platform tables, not operational ones.

---

## 4. Active Company Resolution

The app must derive `company_id` for a request from:
1. The authenticated user's session, **and**
2. The URL path segment (`/c/:companyId/...`, where `:companyId` is the `companies.id` UUID), **validated** against `company_users` on the server.

Cookies are not used to carry the active company. See `COMPANY_ISOLATION_RULES.md §4` for the full rule.

`company_id` is **never** trusted from a client request body. Server actions extract it from the validated context.

---

## 5. Storage Buckets

- One bucket per concern (e.g., `recipes`, `quality`, `batches`), and **objects are prefixed with `company_id/`**.
- Storage RLS policies mirror the SQL pattern: a user can read/write an object only if its path starts with a `company_id` they are a member of.

---

## 6. Migrations Discipline

- One migration per logical change. Migrations are append-only.
- No `DROP TABLE`, no destructive `ALTER` on a production table without a written Fix Report and user sign-off.
- Each migration that adds a tenant table also adds its RLS policies in the same migration.
- The `database.types.ts` Supabase types file is regenerated, not hand-edited.

---

## 7. What Is Forbidden

- Tables without `company_id` for tenant data.
- Tables with RLS disabled, even "temporarily."
- `select *` style queries from server actions on hot paths — list the columns.
- Storing JWTs, passwords, or other secrets in database columns.
- Materialized views that cache cross-tenant data.
- Triggers that read across tenants.

---

## 8. Update Procedure for This Document

To add a new table:
1. Open a section in this file with the column list, FKs, indexes, RLS notes.
2. Get user sign-off.
3. *Then* write the migration.

---

## 9. Phase 5a — Recipes (proposed, pending sign-off)

Three tables introduced in Phase 5a. Materials gets a minimal scaffold here; Phase 5b expands it with lots, stock, allergens, regulatory metadata.

### 9.1 `materials` (minimal scaffold)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `company_id` | `uuid not null` | FK → `companies(id)` `on delete restrict` |
| `code` | `text not null` | Unique per company among non-deleted rows |
| `name` | `text not null` | |
| `type` | `text not null` | `check (type in ('raw','finished'))` — `'semi'` reserved for 5b+ |
| `base_uom` | `text not null` | Free text in 5a (`'g'`, `'kg'`, `'mg'`, `'mL'`, `'L'`, `'unit'`); validated UoM table can come later |
| `density` | `numeric(18,6)` | Nullable; required only when mixing mass and volume (ERP_RULES §1) |
| `notes` | `text` | Nullable |
| `created_at` / `updated_at` | `timestamptz not null default now()` | `updated_at` via shared trigger |
| `deleted_at` | `timestamptz` | Nullable; soft delete preserves code reservation (ERP_RULES §9) |
| `created_by` / `updated_by` | `uuid` FK → `auth.users(id) on delete set null` | |

**Indexes:** `(company_id)`, `(company_id, code) unique where deleted_at is null`, `(company_id, type)`, `(deleted_at)`.

**RLS:** canonical pattern (§3) — members of `company_id` read/write. No platform admin policy on this table.

**Phase 5b additions (preview, not built now):** `default_supplier_id`, `allergen_flags jsonb`, `storage_conditions text`, `regulatory_notes text`, lot/stock satellite tables.

### 9.2 `recipes`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `company_id` | `uuid not null` | FK → `companies(id) on delete restrict` |
| `finished_material_id` | `uuid not null` | FK → `materials(id) on delete restrict`; `materials.type` must be `'finished'` (enforced via trigger or check at app layer) |
| `code` | `text not null` | Unique per company among non-deleted rows; defaults to finished material code |
| `name` | `text not null` | |
| `version` | `int not null default 1` | Editing a `published` recipe creates a new row with `version + 1` (ERP_RULES §2) |
| `status` | `text not null` | `check (status in ('draft','published','archived'))` |
| `mode` | `text not null` | `check (mode in ('quantity','percentage'))` — how items are authored |
| `yield_quantity` | `numeric(18,6) not null` | |
| `yield_uom` | `text not null` | |
| `notes` | `text` | Nullable |
| Timestamps + soft delete + audit cols | | Same pattern as `materials` |

**Indexes:** `(company_id)`, `(company_id, finished_material_id, version) unique where deleted_at is null`, `(company_id, code) unique where deleted_at is null`, `(company_id, status)`.

**RLS:** canonical pattern.

**Cross-table invariants:**
- `finished_material_id` must reference a material in the same `company_id` (enforced by trigger).
- Only one row per `(company_id, finished_material_id)` may have `status = 'published'` (partial unique index).

### 9.3 `recipe_items`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `company_id` | `uuid not null` | Denormalized for RLS hot path; must equal parent recipe's `company_id` (trigger) |
| `recipe_id` | `uuid not null` | FK → `recipes(id) on delete cascade` |
| `material_id` | `uuid not null` | FK → `materials(id) on delete restrict`; must be same `company_id` |
| `position` | `int not null` | Display order; unique per recipe |
| `quantity` | `numeric(18,6) not null` | In `uom`; converted to base for math |
| `uom` | `text not null` | |
| `percentage` | `numeric(8,4)` | Nullable; populated when `recipe.mode = 'percentage'` |
| `active` | `boolean not null default true` | Inactive items allowed as substitutions (ERP_RULES §2) |
| `notes` | `text` | Nullable |
| Timestamps + audit cols | | No soft delete (cascade with parent) |

**Indexes:** `(company_id)`, `(recipe_id, position) unique`, `(material_id)`.

**RLS:** canonical pattern.

**App-layer invariants (not DB-enforced in 5a, deferred to actions):**
- When `recipe.mode = 'percentage'`, the sum of active items' `percentage` must equal `100.0000` before publish.
- When publishing, recipe is immutable after; further edits create `version + 1`.

### 9.4 Files affected

- New migration: `supabase/migrations/20260515000300_phase5a_recipes.sql`
- Server actions under `app/(company)/c/[companyId]/recipes/actions.ts`
- Pages under `app/(company)/c/[companyId]/recipes/` (list, new, [recipeId])
- Sidebar already links to `/c/[companyId]/recipes`
