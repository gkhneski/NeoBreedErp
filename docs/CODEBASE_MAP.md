# CODEBASE_MAP.md — Where everything lives (read after AGENTS.md)

Practical map of the whole project for any AI agent: architecture, the files
that own each domain, current state, workflows, and the gotchas that will bite
you. This is the "everything" guide — not just UI. Rules live in
[AGENTS.md](../AGENTS.md); per-topic detail in the other `docs/*`. **Read those
before changing a domain.**

---

## 1. Architecture in one screen

- **Multi-tenant SaaS.** Every operational row carries `company_id`; Postgres
  **RLS** enforces isolation. Never cross tenants. See
  [COMPANY_ISOLATION_RULES.md](COMPANY_ISOLATION_RULES.md).
- **Route groups:**
  - `app/(company)/c/[companyId]/…` — the tenant ERP (admin, managers, operator).
  - `app/(platform)/superadmin/…` — platform owner only (companies, plans, audit).
  - `app/login/…`, `app/(public)/…` — auth & public.
- **Roles** (`types/roles.ts`): `company_admin`, `production_manager`,
  `quality_manager`, `operator`, `viewer`, `company_user` + platform admin.
  Module visibility = `canAccessModule`; write gates = the `*_WRITE_ROLES` sets.
  **Operator = depot, finished-goods only** (see [[gotchas]] below).
- **Stack:** Next.js App Router + TS, Supabase (Postgres/Auth/Storage/RLS),
  Tailwind + shadcn/ui, Vercel. Font: Plus Jakarta Sans.

## 2. Core plumbing

| Concern | Files |
|---|---|
| Auth / tenant / role guards | `lib/auth.ts` (`requireCompanyUser`, `requireCompanyRole`, `requireModuleAccess`, `requirePlatformAdmin`) |
| Supabase clients | `lib/supabase/server.ts` (`createServerSupabaseClient` = RLS-bound; `createServiceRoleClient` = server-only, bypasses RLS — never in browser) |
| Session cookies | `middleware.ts` |
| Roles & module access | `types/roles.ts` |
| Generated DB types | `types/database.ts` (keep in sync with migrations) |
| DB schema contract | `docs/DATABASE_CONTRACT.md` + `supabase/migrations/*` |

## 3. Domains → key files

| Domain | UI routes (`app/(company)/c/[companyId]/`) | Logic / DB |
|---|---|---|
| **Materials / products** | `materials/*` (raw), `products/*` (finished + recipe), `packaging/*` | `materials/actions.ts` (create/update incl. **`barcode`**), `products/actions.ts`; table `materials` |
| **Lots & stock** | `lots/*` (list, `new`, **`onboarding`** = barcode scan-in), `stock/*` | `lots/actions.ts` (`createLot`, `onboardLot`, `findProductByBarcode`, `createFinishedProductWithBarcode`); tables `material_lots`, `stock_movements`; RPC `create_lot_with_receipt`, `transfer_lot`, `ship_shipment` |
| **Production** | `recipes/*`, `production/*`, `quality/*` | tables `recipes`, `recipe_items`, `production_orders`, `production_batches`; RPC `start_production_order`, `complete_production_batch`; see [ERP_RULES.md](ERP_RULES.md) |
| **Marketplace / Trendyol** | `marketplace/*` (page, `actions.ts`, `import`), `settings/marketplaces/*` (API creds) | `lib/marketplaces/{trendyol,adapters,types,push,discount-engine,connections,stock}.ts`; tables `marketplace_connections` (creds — **in DB, not env**), `marketplace_listings`, `marketplace_price_events`; daily cron `app/api/cron/marketplace-discounts/route.ts` (`CRON_SECRET`) |
| **Shipments / warehouse** | `shipments/*`, `warehouse/*` (scan, locations), `settings/locations/*` (create depot) | depot = **second `location` in the same tenant** (Phase 7), not a separate company |
| **Platform / superadmin** | `app/(platform)/superadmin/*` | platform-level only; see [SUPERADMIN_RULES.md](SUPERADMIN_RULES.md) |
| **Dashboards, sidebar, search, theme** | see **[UI_DESIGN_SYSTEM.md](UI_DESIGN_SYSTEM.md)** | `app/(company)/c/[companyId]/dashboard-visuals.tsx` (shared by admin **and** operator), `components/layout/*sidebar.tsx`, `global-search.tsx` + `search-actions.ts`, `app/layout.tsx` (font), `app/globals.css` (`--sidebar*` tokens) |

## 4. Config & ops

| File | Role |
|---|---|
| `app/layout.tsx` | Global font (Plus Jakarta Sans → `--font-sans`) |
| `app/globals.css` | Theme tokens, incl. `--sidebar*` (sidebar colors live here) |
| `tailwind.config.ts` | Token → utility mapping |
| `vercel.json` | Cron schedule (marketplace discounts) |
| `.github/workflows/ci.yml` | CI = typecheck + lint only (**E2E removed — it polluted prod**) |
| `.env.local` | Secrets (Supabase keys, `VERCEL_TOKEN`, `CRON_SECRET`) — gitignored |

**Deploy:** `git push` to `feat/phase-5-erp-core` only makes a **Preview**.
Production is published with `vercel --prod --yes` (CLI installed, token in
`.env.local`). **DB migrations:** `npx supabase db push` (CLI authed; use
`--dry-run` first). See [CLAUDE_WORKFLOW.md](CLAUDE_WORKFLOW.md).

## 5. <a id="gotchas"></a>Gotchas (these will bite you)

1. **Operator = finished-goods only.** Never surface raw materials / factory ops
   to the operator role. Filter by `type='finished'` and gate by `OPERATOR_MODULES`.
2. **`dashboard-visuals.tsx` is shared** by the admin and operator dashboards —
   a change there affects both.
3. **Sidebar colors are tokens** in `app/globals.css` (`--sidebar*`), not
   hard-coded in the component. Keep a working `.dark` variant.
4. **Trendyol credentials live in the DB** (`marketplace_connections`, entered in
   Settings → Pazaryeri), **not** in env. Per company.
5. **Do not run E2E (Playwright) against production.** It created garbage orders;
   it was removed from CI. Use a separate DB + cleanup if ever re-enabled.
6. **No fabricated data on screen.** Every label names real ERP info.
7. **`git push` ≠ live.** Run `vercel --prod` to publish.
8. **Service-role client is server-only.** Never reach prod DB directly from the
   browser or paste the service key into client code.

## 6. Index of detailed docs

`PROJECT_BRIEF`, `PHASE_PLAN`, `DATABASE_CONTRACT`, `ERP_RULES`,
`COMPANY_ISOLATION_RULES`, `SECURITY_RULES`, `SUPERADMIN_RULES`,
`UI_DESIGN_SYSTEM`, `CLAUDE_WORKFLOW`, `OPERATIONS_CHECKLIST`,
`BACKUP_RESTORE`, `DESIGN_DIRECTION`.
