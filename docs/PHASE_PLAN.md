# PHASE_PLAN.md

Phases are sequential. **Do not start a phase until the previous one is signed off by the user.** Each phase lists what is allowed and what is explicitly forbidden inside it.

---

## Phase 0 — Governance (CURRENT)

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
- `company_users` (membership) table with role: `company_admin | company_user`.
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

## Out of MVP (do not start)

- **e-Fatura, e-İrsaliye, GİB.**
- Full GL / accounting.
- Supplier / customer external portals.
- Native mobile apps.
- AI-generated formulations.

---

## How Phase Changes Happen

The user types something like *"Phase X done, start Phase Y."* Until that happens, agents stay inside the current phase. If a task feels out of phase, **say so** and ask whether to defer or to advance the phase.
