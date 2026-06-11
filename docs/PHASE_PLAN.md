# PHASE_PLAN.md

Phases are sequential. **Do not start a phase until the previous one is signed off by the user.** Each phase lists what is allowed and what is explicitly forbidden inside it.

---

## Current Status (as of 2026-05-21)

| Phase | State |
|---|---|
| 0 — Governance | ✓ done |
| 1 — Scaffold | ✓ done |
| 2 — Supabase + Auth | ✓ done (consolidated in `20260515000000_init.sql`) |
| 3 — Multi-tenant foundation | ✓ done (consolidated in `20260515000000_init.sql`) |
| 4 — Super Admin console | ✓ done — companies CRUD + packages + audit table + member invite flow + audit log viewer (2026-06-10) |
| 5a — Recipes / formulations | ✓ done (migration applied) |
| **5b step 1 — Suppliers + Materials expansion** | ✓ done (migration `20260516000000_phase5b_materials_expand.sql` applied 2026-05-20) |
| **5b step 2 — Lots + stock movements** | ✓ done (migration `20260520000000_phase5b_lots_stock.sql` applied 2026-05-20) |
| 5c step 1 — Production orders | ✓ done (migration `20260520000100_phase5c_production_orders.sql` authored) |
| 5c step 2 — Production batches + execution | ✓ done (migration `20260521000000_phase5c_production_batches.sql` authored) |
| 5d — Quality control | ✓ done (migration `20260522000000_phase5d_quality_control.sql` authored) |
| 5e — Basic costing (per-batch material rollup) | ✓ done (migration `20260523000000_phase5e_cost_snapshots.sql` authored) |
| 5f — Per-company file storage | ✓ done (migration `20260524000000_phase5f_file_attachments.sql` authored) |
| 6 — Hardening | ✓ done (code side; restore drill + PITR remain as operator tasks, see OPERATIONS_CHECKLIST.md) |
| **7a — Customers & fason production** | **in progress** (plan approved 2026-06-11) |
| 7b — Locations & lot transfer | planned |
| 7c — QR labels & depot scanning | planned |

> Faz 5a kapsam notu: `materials` Faz 5a'da minimal iskelet (`code`, `name`, `type`, `base_uom`, `density`) olarak girdi. Faz 5b step 1 ile `default_supplier_id`, `allergen_flags jsonb`, `storage_conditions`, `regulatory_notes` eklendi; ayrıca `suppliers` tablosu girdi.
>
> Faz 5b step 2 kapsam notu: `material_lots` (lot/batch) ve `stock_movements` (append-only signed-quantity ledger) eklendi. `quantity_on_hand` lot satırında trigger ile bakım yapılır; lotlar negatif olamaz; ledger güncelleme/silme yasak (düzeltme için yeni `adjustment` hareketi). Atomik mal-kabul `create_lot_with_receipt` RPC üzerinden. CoA file storage (Faz 5f) ve `transfer` türü (çok-lokasyon) ertelendi.
>
> Faz 5c–5f kapsam notu: Üretim emri, üretim partisi, lot tüketimi/çıkış lotu, QC imza akışı, batch maliyet snapshot'ları ve tenant-scoped dosya ekleri MVP sunum kapsamına alındı. Tüm yeni operasyonel tablolar `company_id` taşır; RLS ve same-company guard triggerları migration içinde gelir. File storage private `tenant-files` bucket + `<company_id>/...` prefix kuralıyla ilerler.

Active company resolution is **path-based** (`/c/:companyId/...`). Cookie-based resolution was removed on 2026-05-15.

---

## Phase 0 — Governance

**Goal:** Establish the documentation that all later work must respect.

**Allowed:**
- Create / edit governance docs in the repo root and in `docs/`.
- Discuss architecture in prose.

**Forbidden:**
- Any app code (`app/`, `components/`, `lib/`, etc.).
- Any database migration.
- `package.json`, dependency installs, scaffolding tools.
- Environment files.

**Exit criteria:** User explicitly says "Phase 0 done, start Phase 1."

---

## Phase 1 — Project Scaffold

**Goal:** A working empty Next.js + TypeScript + Tailwind + shadcn skeleton on Vercel.

**Allowed:**
- `npx create-next-app` (App Router, TS, Tailwind, ESLint).
- Add shadcn/ui (init only; do not generate every component).
- Add base ESLint / Prettier / TS config.
- Create `lib/` folders that are *empty placeholders* documented in code comments.
- First Vercel deploy with a placeholder landing page.

**Forbidden:**
- Supabase client code yet.
- Any business route.
- Any database schema.

---

## Phase 2 — Supabase Wiring & Auth Shell

**Goal:** Connect to Supabase, get a sign-in flow working, but **no business tables yet**.

**Allowed:**
- `@supabase/ssr` server/browser client factories.
- Login / logout / session refresh.
- `middleware.ts` to refresh session cookies.
- A `profiles` table mirroring `auth.users` (minimal: id, full_name, created_at).

**Forbidden:**
- Tenant tables.
- RLS-less tables (every new table must ship with RLS from day one).
- Mixing Super Admin and Company Admin in the same route group.

---

## Phase 3 — Multi-Tenant Foundation

**Goal:** The platform understands "companies" and "memberships."

**Allowed:**
- `companies` table.
- `company_users` (membership) table with role: `company_admin | production_manager | quality_manager | operator | viewer` plus legacy/demo `company_user`.
- A separate `platform_admins` table (or column) identifying Super Admins.
- Active-company resolution (cookie or path segment) — design first, implement second.
- RLS policies on `companies` and `company_users`.

**Forbidden:**
- Any operational table (recipes, stock, production, QC, cost).
- UI that lets a Company Admin see another company.

**Exit criteria:** Super Admin can create a company and invite a Company Admin. Company Admin can log in and is scoped to exactly one company.

---

## Phase 4 — Super Admin Console (Platform-Level Only)

**Goal:** Gökhan Eski can administer the platform.

**Allowed:**
- Super Admin routes under a dedicated route group (e.g., `app/(platform)/admin/...`).
- CRUD for companies, packages (plans), user/seat limits.
- Platform metrics (count of companies, active users — aggregate only).
- Audit log table for platform actions.

**Forbidden:**
- Super Admin reading a company's recipes, stock, production, QC, or cost rows.
- Super Admin "impersonate" feature (not in MVP).
- Mixing platform admin UI with company UI in the same layout.

---

## Phase 5 — ERP Core (Per-Company, Isolated)

Sub-phases — each is its own milestone:

- **5a.** Recipes / formulations
- **5b.** Raw materials & finished goods, stock with lot/batch
- **5c.** Production orders & batches
- **5d.** Quality control records
- **5e.** Basic costing (material cost roll-up per batch)
- **5f.** Per-company file storage (Supabase Storage with tenant prefix)

**Allowed (each sub-phase):**
- Tables, RLS policies, server actions, UI for that module.
- All rows must carry `company_id` and pass RLS.

**Forbidden:**
- Cross-company queries, even read-only "stats."
- Hardcoding `company_id` from client input.
- Starting sub-phase N+1 before N is signed off.

---

## Phase 6 — Hardening

**Goal:** Production-grade quality.

**Allowed:**
- E2E tests with seeded tenants.
- Performance indexes on `company_id` + hot columns.
- Backup / restore drill notes.
- Rate limiting, basic abuse protection.

**Forbidden:**
- New features. This phase is purely hardening.

---

## Phase 7 — Fason, Second Depot & Barcode (post-MVP, approved 2026-06-11)

Business driver: the factory tenant produces; finished goods physically move to the sister company's depot (modeled as a **second location in the same tenant**, NOT a separate tenant) and are received there by QR scan. The factory also manufactures on behalf of external customers ("fason") — records only, no portal.

- **7a.** `customers` table + `customer_id` on production orders + customer-owned lots (`owner_customer_id`, excluded from batch cost).
- **7b.** `locations` table + `location_id` on lots + whole-lot `transfer` movements (zero-quantity ledger rows) + `transfer_lot` RPC. Only `released` lots can transfer.
- **7c.** QR label print page per lot + phone-camera scan page with one-tap transfer to the shipping depot.

**Forbidden in Phase 7:** invoicing/accounting, customer portals, partial lot splits, separate tenant for the sister company.

---

## Out of MVP (do not start)

- **e-Fatura, e-İrsaliye, GİB.**
- Full GL / accounting.
- Supplier / customer external portals.
- Native mobile apps.
- AI-generated formulations.

---

## How Phase Changes Happen

The user types something like *"Phase X done, start Phase Y."* Until that happens, agents stay inside the current phase. If a task feels out of phase, **say so** and ask whether to defer or to advance the phase.
