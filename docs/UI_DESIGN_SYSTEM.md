# UI_DESIGN_SYSTEM.md — Design system & files to respect

This document records the shared UI/design system introduced in the dashboard
redesign. **Any agent touching the UI must read this first** and keep these
conventions; do not reinvent or revert them.

---

## 1. Visual language

- **Reference:** a clean light "product dashboard" (Donezo/Fireart Dribbble) —
  white surfaces, **forest/emerald green** accent, rounded-2xl/3xl cards, soft
  shadows, real data viz, subtle entrance animation. Adapted to NeoBreed's real
  ERP data (no fabricated/demo content — see AGENTS.md content rules).
- **Font:** **Plus Jakarta Sans** (Google) for the whole app, with `latin` +
  `latin-ext` (Turkish). Set in `app/layout.tsx` via `next/font/google` →
  `--font-sans`. Do not swap it back to Inter.
- **Accent green:** emerald/green Tailwind shades; hero gradients
  `from-green-700/800 … to-emerald-500`; gauges `#15803d → #34d399`.
- **Numbers** animate (count-up), **bars** grow on mount, **gauges** sweep in.

## 2. Key files (handle with care)

| File | What it owns |
|---|---|
| `app/layout.tsx` | Global font (Plus Jakarta Sans → `--font-sans`). |
| `app/globals.css` | Theme tokens incl. **`--sidebar*`** (light/green sidebar palette for `:root`, dark variant under `.dark`). Sidebar colors live here, not in components. |
| `tailwind.config.ts` | `fontFamily.sans` → `var(--font-sans)`; `sidebar.*` token mapping. |
| `app/(company)/c/[companyId]/dashboard-visuals.tsx` | **Shared animated dashboard component** (KPI cards, pill bar chart, half-donut gauge, reminder, tasks, team, live clock). Used by BOTH the admin and operator dashboards. Change here = changes both. |
| `app/(company)/c/[companyId]/page.tsx` | Company (admin) + operator (`ClerkDashboard`) dashboards: data loaders → `DashboardVisuals`. |
| `components/layout/company-sidebar.tsx` | Company/operator sidebar: green logo mark, flat icon menu under plain section labels (no collapse), green active pill + edge bar, account footer (avatar/email/role/logout). |
| `components/layout/platform-sidebar.tsx` | Superadmin sidebar — same pattern, red "Platform" badge. |
| `app/(company)/c/[companyId]/layout.tsx` | Top bar = **global search** + sidebar. Account moved into the sidebar footer. |
| `app/(platform)/superadmin/layout.tsx` | Superadmin top bar/layout (account in sidebar footer, red platform strip). |
| `app/(company)/c/[companyId]/global-search.tsx` + `search-actions.ts` | Global search box + server action (products, raw materials incl. barcode, lots, suppliers, customers, users; RLS/company scoped). |

## 3. Rules for agents

- **Reuse `DashboardVisuals`** for any new dashboard surface instead of hand-
  rolling cards/charts. Feed it real counts; pass `canManageTeam={false}` where
  the role can't manage users (e.g. operator).
- **Sidebar colors come from `--sidebar*` in `globals.css`** — restyle there,
  not with hard-coded colors in the component. Keep a working `.dark` variant.
- Keep the **account footer** + **global search** in their current places;
  don't move the account back into the top bar.
- Respect role scoping already wired in `types/roles.ts`
  (`OPERATOR_MODULES`, `MARKETPLACE_WRITE_ROLES`, etc.) and the
  operator = finished-goods-only rule.
- No fabricated data on screen (fake people/tasks/telemetry). Every label names
  real ERP information.

## 4. Deploy

Code is committed to `feat/phase-5-erp-core` and deployed to production with the
Vercel CLI (`vercel --prod --yes`, token in `.env.local`) — a plain `git push`
only makes a Preview. DB migrations applied with `npx supabase db push`.
