# PROJECT_BRIEF.md

## 1. Product

**NeoBreed-ERP** is a multi-company SaaS ERP platform built for **food supplement (gıda takviyesi) manufacturers**. Each customer company runs its production, stock, recipe, quality, and cost operations inside its own isolated tenant.

This is **not** an internal ERP for a single company. It is a SaaS platform with many tenants.

## 2. Stakeholders

| Role | Person | Scope |
|---|---|---|
| Platform Owner / Super Admin | **Gökhan Eski** | The entire platform: companies, packages, limits, billing settings. |
| Company Admin | e.g., **Prof. Dr. Eray Çalışkan** (X Company) | One company's operations and users. |
| Company User | Operators, lab staff, accountants of a company | Day-to-day operational use within their company. |

The Super Admin **never** logs in to operate a company's production. The Company Admin **never** sees another company.

## 3. Problem We Are Solving

Food supplement manufacturers in Turkey typically juggle Excel files, paper batch records, and disconnected tools to track recipes, raw material lots, in-process production, quality control, and unit cost. NeoBreed-ERP replaces those with a single tenant-isolated system.

## 4. MVP Scope (high level)

In scope:

- Super Admin console: create/suspend companies, set package, set user/seat limits, view platform metrics.
- Company onboarding: a Company Admin is invited and bootstraps their tenant.
- Per-company auth (Supabase Auth) with company-scoped roles.
- ERP modules (per company, isolated):
  - Recipes / formulations (bill of materials)
  - Raw materials & finished goods (stock with lot/batch tracking)
  - Production orders & batches
  - Quality control records
  - Basic costing (material cost roll-up per batch)
- File storage per company (specs, CoAs, batch records) via Supabase Storage with tenant-scoped buckets/prefixes.

Out of scope for MVP (explicit):

- **e-Fatura, e-İrsaliye, GİB integrations** — not in MVP.
- Full accounting / general ledger.
- Customer portals or external supplier portals.
- Mobile native apps.
- Multi-currency complex FX handling beyond a simple currency field.

## 5. Tech Stack (locked for MVP)

- **Framework:** Next.js (App Router) + TypeScript
- **DB / Auth / Storage:** Supabase (Postgres with Row Level Security)
- **UI:** Tailwind CSS + shadcn/ui
- **Hosting:** Vercel
- **VCS:** GitHub

## 6. Quality Bars

- Multi-tenant isolation must be enforced at the **database** (RLS) — not only in app code.
- All tenant tables must include `company_id` and have RLS policies.
- Secrets never reach the browser; service role keys are server-only.
- Every operational write goes through a server action or server route handler.
- Type safety end-to-end; no `any` without justification.

## 7. Success Criteria for the Documentation Phase

This phase produces only **docs**. Success means:

- A new contributor (human or AI) can read AGENTS.md + the `docs/` set and understand what to build, in what order, and what is forbidden.
- The boundary between Super Admin and Company Admin is unambiguous.
- The multi-tenant isolation rules are written, not implicit.
- The phase plan tells anyone what is allowed *right now* and what is not.
