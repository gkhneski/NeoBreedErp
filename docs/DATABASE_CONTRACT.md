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
- `company_users` — links users to companies with a role. **Has `company_id`.** A user may belong to multiple companies (future-proof), but the active company is one at a time. Valid roles are `company_admin`, `production_manager`, `quality_manager`, `operator`, `viewer`, plus legacy/demo `company_user`.

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

---

## 10. Phase 5b — Step 1: Suppliers + Materials Expansion

Scope of this step: introduce the `suppliers` tenant table and extend `materials` with supplier reference, allergen flags, storage conditions, and regulatory notes. Lots, stock movements, and CoA file storage are deferred to Phase 5b — Step 2.

### 10.1 `suppliers`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `company_id` | `uuid not null` | FK → `companies(id) on delete restrict` |
| `code` | `text not null` | Unique per company among non-deleted rows |
| `name` | `text not null` | |
| `tax_number` | `text` | Nullable (TR vergi no, EU VAT, etc.) |
| `email` | `text` | Nullable; app-layer email validation |
| `phone` | `text` | Nullable; free text (international formats vary) |
| `address` | `text` | Nullable; multi-line allowed |
| `country` | `text` | Nullable; ISO 3166-1 alpha-2 recommended, app-layer check |
| `notes` | `text` | Nullable |
| `created_at` / `updated_at` | `timestamptz not null default now()` | `updated_at` via shared trigger |
| `deleted_at` | `timestamptz` | Nullable; soft delete preserves code reservation |
| `created_by` / `updated_by` | `uuid` FK → `auth.users(id) on delete set null` | |

**Indexes:** `(company_id)`, `(company_id, code) unique where deleted_at is null`, `(deleted_at)`.

**RLS:** canonical pattern (§3) — members of `company_id` read/write. No platform admin policy.

### 10.2 `materials` — additions

The following columns are added to the existing `materials` table from Phase 5a:

| Column | Type | Notes |
|---|---|---|
| `default_supplier_id` | `uuid` | FK → `suppliers(id) on delete set null`; **must reference a supplier in the same `company_id`** (trigger-enforced) |
| `allergen_flags` | `jsonb not null default '[]'::jsonb` | Array of string codes. Validated values at app layer: `gluten`, `crustaceans`, `eggs`, `fish`, `peanuts`, `soybeans`, `milk`, `nuts`, `celery`, `mustard`, `sesame`, `sulphites`, `lupin`, `mollusks` (EU 14 + sulphites). DB stores opaque array; expansion does not require migration. |
| `storage_conditions` | `text` | Nullable. Free text in DB; UI suggests `oda sıcaklığı`, `soğuk (2–8°C)`, `dondurulmuş`, `kuru ve serin`, `ışıktan uzak`, `kontrollü atmosfer`. |
| `regulatory_notes` | `text` | Nullable; free text (TGK, OGM ref, ihracat kısıtları vb.). |

**New index:** `materials_supplier_idx on (company_id, default_supplier_id)`.

**Cross-tenant invariant (trigger):** When `default_supplier_id is not null`, the referenced supplier's `company_id` must equal the material's `company_id`. Enforced via a `before insert or update` trigger that raises on mismatch.

### 10.3 Files affected

- New migration: `supabase/migrations/20260516000000_phase5b_materials_expand.sql`
- New server actions: `app/(company)/c/[companyId]/suppliers/actions.ts`
- New pages: `app/(company)/c/[companyId]/suppliers/` (list, new)
- New page: `app/(company)/c/[companyId]/materials/[materialId]/page.tsx` (read-only detail)
- Updated: `app/(company)/c/[companyId]/materials/{actions.ts, page.tsx, new/material-form.tsx}`
- Updated: company sidebar adds "Tedarikçiler" link; `companyModulePath` gains `"suppliers"` key.

### 10.4 Deferred to Phase 5b — Step 2

- `material_lots` (lot/batch with supplier, received/expiry, unit cost, CoA file ref, status)
- `stock_movements` (append-only ledger; `receipt | issue | adjustment | transfer`; lot-serialized; quantity-on-hand derived)
- Storage bucket `materials` with `<company_id>/coa/...` prefix for lot CoA PDFs.

---

## 11. Phase 5b — Step 2: Lots + Stock Movements

Scope: lot/batch tracking on top of `materials`, plus an append-only `stock_movements` ledger. On-hand quantity is **derived** from the ledger and maintained on the lot row by trigger (ERP_RULES §4). CoA file storage bucket is **deferred to Phase 5f**; the contract reserves `coa_file_path` as a nullable text placeholder so we don't need a follow-up migration.

### 11.1 `material_lots`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `company_id` | `uuid not null` | FK → `companies(id) on delete restrict` |
| `material_id` | `uuid not null` | FK → `materials(id) on delete restrict`; trigger ensures same `company_id` |
| `supplier_id` | `uuid` | FK → `suppliers(id) on delete set null`; nullable (in-house outputs have none); trigger ensures same `company_id` when not null |
| `lot_number` | `text not null` | Unique per `(company_id, material_id)` among non-deleted rows |
| `received_at` | `date not null default current_date` | When the lot landed |
| `expiry_date` | `date` | Nullable |
| `unit_cost` | `numeric(18,4)` | Nullable; in company currency at receipt; used for batch costing (ERP_RULES §7) |
| `currency` | `text` | Nullable; ISO 4217 (e.g. `TRY`). Defaults to company currency at app layer in step 2 |
| `quantity_on_hand` | `numeric(18,6) not null default 0` | **Maintained by trigger** from `stock_movements`. Never edited by app code. `check (quantity_on_hand >= 0)` |
| `status` | `text not null default 'quarantine'` | `check (status in ('quarantine','released','blocked'))` — QC sign-off in Phase 5d flips `quarantine → released`; failed QC sets `blocked` |
| `coa_file_path` | `text` | Nullable; populated when Storage bucket is introduced in Phase 5f. No bucket assumed yet. |
| `notes` | `text` | Nullable |
| `created_at` / `updated_at` | `timestamptz not null default now()` | Shared trigger |
| `deleted_at` | `timestamptz` | Soft delete; reserves lot_number |
| `created_by` / `updated_by` | `uuid` FK → `auth.users(id) on delete set null` | |

**Indexes:** `(company_id)`, `(company_id, material_id)`, `(company_id, material_id, lot_number) unique where deleted_at is null`, `(supplier_id)`, `(company_id, expiry_date) where deleted_at is null`, `(deleted_at)`.

**RLS:** canonical pattern (§3) — members of `company_id` read/write.

**Cross-tenant invariants (triggers):**
- `material_id`'s `company_id` must equal the lot's `company_id`.
- When `supplier_id is not null`, the supplier's `company_id` must equal the lot's `company_id`.
- A lot may not be soft-deleted while `quantity_on_hand > 0` (app-layer check; not DB-enforced).

### 11.2 `stock_movements`

Append-only ledger. Quantity is **signed** (positive = into stock, negative = out). Step 2 supports `receipt | issue | adjustment`; `transfer` is reserved for a future multi-location phase and **not in the check constraint yet** (locations are out of MVP per ERP_RULES §12).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `company_id` | `uuid not null` | Denormalized for RLS; trigger enforces equality with `material_id` and `lot_id` parents |
| `material_id` | `uuid not null` | FK → `materials(id) on delete restrict` |
| `lot_id` | `uuid not null` | FK → `material_lots(id) on delete restrict`; must reference a lot whose `material_id` equals this row's `material_id` |
| `kind` | `text not null` | `check (kind in ('receipt','issue','adjustment'))` |
| `quantity` | `numeric(18,6) not null` | Signed, in base UoM. `check ((kind='receipt' and quantity > 0) or (kind='issue' and quantity < 0) or (kind='adjustment' and quantity <> 0))` |
| `unit_cost` | `numeric(18,4)` | Captured for `receipt` to set lot cost; null for `issue`/`adjustment`. App layer enforces presence on receipt. |
| `reason` | `text` | Required at app layer for `adjustment`; optional otherwise |
| `occurred_at` | `timestamptz not null default now()` | When the physical event happened (may differ from `created_at`) |
| `notes` | `text` | Nullable |
| `created_at` | `timestamptz not null default now()` | No `updated_at`: ledger is append-only |
| `created_by` | `uuid` FK → `auth.users(id) on delete set null` | |

**Indexes:** `(company_id)`, `(company_id, material_id)`, `(lot_id)`, `(company_id, occurred_at desc)`, `(company_id, kind)`.

**RLS:** canonical pattern (§3).

**Append-only enforcement (trigger):** A `before update or delete` trigger raises an exception. Mistakes are corrected via a new `adjustment` movement (ledger discipline), never by editing or deleting prior rows.

**Cross-tenant + parent-consistency invariants (triggers):**
- `material_id`'s `company_id` must equal the movement's `company_id`.
- `lot_id`'s `company_id` must equal the movement's `company_id`, **and** `lot_id`'s `material_id` must equal the movement's `material_id`.

**Lot quantity maintenance (trigger):** `after insert on stock_movements`:
1. `select ... for update` the parent lot row (serializes concurrent inserts on the same lot — ERP_RULES §10).
2. Recompute `quantity_on_hand` as `sum(quantity)` over non-deleted lot's movements.
3. If the result is negative, raise — rolling back the insert (ERP_RULES §4: lots may not go negative).
4. Otherwise update the lot's `quantity_on_hand` and `updated_at`.

### 11.3 Files affected

- New migration: `supabase/migrations/20260520000000_phase5b_lots_stock.sql`
- New server actions:
  - `app/(company)/c/[companyId]/lots/actions.ts` — create lot **with initial receipt** in a single action (insert lot row, then insert `receipt` movement); soft delete a lot only when on-hand = 0.
  - `app/(company)/c/[companyId]/stock/actions.ts` — `recordIssue`, `recordAdjustment`.
- New pages:
  - `app/(company)/c/[companyId]/lots/page.tsx` — list with on-hand and expiry flags.
  - `app/(company)/c/[companyId]/lots/new/page.tsx` + `lot-form.tsx` — receipt form.
  - `app/(company)/c/[companyId]/stock/page.tsx` — ledger view with kind + material filter.
  - `app/(company)/c/[companyId]/stock/new/page.tsx` + `stock-form.tsx` — issue/adjustment form, lot selector restricted to lots with `quantity_on_hand > 0` (for issue).
- Updated: company sidebar already has `"stock"` entry; add `"lots"` ahead of it.
- Updated: no schema changes to `materials` or `suppliers` in this step.

### 11.4 Deferred to later phases

- `coa_file_path` is reserved; the `materials` Storage bucket and CoA upload UI are deferred to Phase 5f.
- Multi-location / `transfer` kind: deferred (locations out of MVP).
- Lot status transitions (`quarantine → released | blocked`) are stored but the QC-driven flip happens in Phase 5d. Manual override is allowed in Step 2 via a lot status action, app-layer only.

---

## 12. Phase 5c - Production Orders & Batches

### 12.1 `production_orders`

Per-company production order header. Each row carries `company_id uuid not null`, `code`, `finished_material_id`, `recipe_id`, planned quantity/UoM, status, lifecycle timestamps, notes, soft delete, and audit columns.

**Status:** `draft | planned | in_progress | completed | closed | cancelled`.

**Indexes:** `(company_id)`, unique `(company_id, code) where deleted_at is null`, `(company_id, status)`, `(recipe_id)`, `(finished_material_id)`, `(company_id, planned_start_at)`, `(deleted_at)`.

**RLS:** canonical member select/modify policies. No platform-admin bypass.

**Cross-tenant invariants:** trigger ensures `finished_material_id` belongs to the same company and is `materials.type = 'finished'`; `recipe_id` belongs to the same company, is `published`, and references the same finished material.

### 12.2 `production_batches`

Per-company execution row for a production order. Each row carries `company_id`, `production_order_id`, `batch_number`, `recipe_id`, optional `output_lot_id`, planned/actual quantity, UoM, status, lifecycle timestamps, batch cost summary, soft delete, and audit columns.

**Status:** `in_progress | completed | closed | cancelled`.

**Indexes:** `(company_id)`, unique `(company_id, batch_number) where deleted_at is null`, `(production_order_id)`, `(company_id, status)`, `(output_lot_id)`, `(deleted_at)`.

**RLS:** canonical member select/modify policies.

**Cross-tenant invariants:** trigger ensures order, recipe, and output lot all belong to the batch company. If `output_lot_id` is present, its material must equal the order's finished material.

**Stock integration:** `stock_movements.batch_id` is added as nullable FK to `production_batches(id) on delete restrict`; the stock movement parent guard also validates batch same-company.

**RPCs:** `start_production_order(company, order, batch_number)` moves `planned -> in_progress` and creates a batch. `complete_production_batch(company, batch, actual_quantity, output_lot_number, output_expiry_date, consumed[])` issues consumed released lots, creates a quarantine output lot, records receipt, completes the batch/order, and writes costing data when available. RPCs are `security invoker`; RLS still applies.

**Files affected:** `supabase/migrations/20260520000100_phase5c_production_orders.sql`, `supabase/migrations/20260521000000_phase5c_production_batches.sql`, and company routes under `app/(company)/c/[companyId]/production/`.

---

## 13. Phase 5d - Quality Control

### 13.1 `quality_checks`

Per-company QC header. Each row carries `company_id`, `code`, `subject_kind`, exactly one subject FK (`material_lot_id` or `production_batch_id`), status, signer/timestamp, notes, soft delete, and audit columns.

**Subject kind:** `material_lot | production_batch`.

**Status:** `draft | passed | failed | cancelled`.

**Indexes:** `(company_id)`, unique `(company_id, code) where deleted_at is null`, `(company_id, status)`, `(material_lot_id)`, `(production_batch_id)`, `(company_id, signed_at desc)`, `(deleted_at)`.

**RLS:** canonical member select/modify policies.

**Cross-tenant invariants:** trigger ensures the selected lot or production batch belongs to the same company.

### 13.2 `quality_check_results`

Per-check QC line items. Each row carries `company_id`, `quality_check_id`, `position`, spec target, measured value, verdict, notes, and timestamps.

**Verdict:** `pending | pass | fail | na`.

**Indexes:** `(company_id)`, `(quality_check_id)`, unique `(quality_check_id, position)`.

**RLS:** canonical member select/modify policies.

**Mutation rule:** result rows are editable only while the parent check is `draft`; signed, failed, cancelled, or deleted checks freeze results via trigger.

**RPCs:** `sign_quality_check(company, check, verdict)` validates all result rows, signs the check, and releases/blocks the lot. Passed production-batch QC also closes the batch and order. `cancel_quality_check(company, check)` soft-cancels draft checks. RPCs are `security invoker`.

**Files affected:** `supabase/migrations/20260522000000_phase5d_quality_control.sql` and company routes under `app/(company)/c/[companyId]/quality/`.

---

## 14. Phase 5e - Cost Snapshots

### 14.1 `cost_snapshots`

Append-only per-batch material cost lines created when a production batch is completed. Each row carries `company_id`, `production_batch_id`, `material_id`, `lot_id`, quantity, unit cost, currency, line cost, `created_at`, and `created_by`.

**Indexes:** `(company_id)`, `(production_batch_id)`, `(company_id, material_id)`, `(lot_id)`.

**RLS:** canonical member select/modify policies, with DB trigger blocking update/delete.

**Cross-tenant invariants:** trigger ensures batch, material, and lot all belong to the same company, and the lot material matches the snapshot material.

**Files affected:** `supabase/migrations/20260523000000_phase5e_cost_snapshots.sql`.

---

## 15. Phase 5f - Per-Company File Storage

### 15.1 Storage bucket

Private Supabase Storage bucket: `tenant-files`.

**Path rule:** every object path starts with `<company_id>/`; domain sub-prefixes include `lots/` and `quality/`.

**Storage RLS:** policies on `storage.objects` are scoped to `bucket_id = 'tenant-files'` and require the first path segment to be a company where `auth.uid()` has active membership.

### 15.2 `file_attachments`

Per-company metadata table for files attached to either a material lot or a QC check. Each row carries `company_id`, `subject_kind`, exactly one subject FK, `kind`, `storage_path`, original file name, MIME type, size, notes, `created_at`, and `created_by`.

**Subject kind:** `material_lot | quality_check`.

**Kind:** `coa | msds | invoice | lab_report | other`.

**Indexes:** `(company_id)`, `(material_lot_id) where material_lot_id is not null`, `(quality_check_id) where quality_check_id is not null`, `(company_id, kind)`, unique `(storage_path)`.

**RLS:** canonical member select/modify policies. Storage path is immutable and must start with the row `company_id`.

**Server validation:** upload surfaces accept PDF/JPG/PNG/WEBP; default app limit is 10 MB, DB max guard is 25 MB.

**Files affected:** `supabase/migrations/20260524000000_phase5f_file_attachments.sql`, `lib/storage/attachments.ts`, `components/files/*`, and file actions under `app/(company)/c/[companyId]/files/actions.ts`.
