# NeoBreed-ERP

Multi-company SaaS ERP platform for food supplement manufacturers.

**Platform Owner / Super Admin:** Gökhan Eski.

This repository is currently at **Phase 1 — Project Foundation**. See [docs/PHASE_PLAN.md](docs/PHASE_PLAN.md).

---

## Read first (governance)

Anyone (human or AI) modifying this repository must read these before touching code:

- [AGENTS.md](AGENTS.md) — binding rules for AI agents
- [CLAUDE.md](CLAUDE.md) — Claude-specific operating manual
- [DO_NOT_TOUCH.md](DO_NOT_TOUCH.md) — protected files
- [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md)
- [docs/PHASE_PLAN.md](docs/PHASE_PLAN.md)
- [docs/DESIGN_DIRECTION.md](docs/DESIGN_DIRECTION.md)
- [docs/DATABASE_CONTRACT.md](docs/DATABASE_CONTRACT.md)
- [docs/SECURITY_RULES.md](docs/SECURITY_RULES.md)
- [docs/COMPANY_ISOLATION_RULES.md](docs/COMPANY_ISOLATION_RULES.md)
- [docs/SUPERADMIN_RULES.md](docs/SUPERADMIN_RULES.md)
- [docs/ERP_RULES.md](docs/ERP_RULES.md)
- [docs/CLAUDE_WORKFLOW.md](docs/CLAUDE_WORKFLOW.md)
- [docs/FIX_REPORT_TEMPLATE.md](docs/FIX_REPORT_TEMPLATE.md)

---

## Tech stack

- Next.js (App Router) + TypeScript
- Tailwind CSS, shadcn/ui-compatible setup
- Supabase (Auth, Postgres + RLS, Storage) — wired in Phase 2
- Vercel hosting, GitHub source of truth

---

## Local setup

Prerequisites: **Node.js 20+** and **npm 10+** (or pnpm).

```powershell
# 1. Install dependencies
npm install

# 2. Create your local env file (not used yet in Phase 1)
copy .env.example .env.local

# 3. Run the dev server
npm run dev
```

Then open:

| URL                                    | Audience                                           |
| -------------------------------------- | -------------------------------------------------- |
| `http://localhost:3000`                | Public landing                                     |
| `http://localhost:3000/login`          | Login placeholder (auth in Phase 2)                |
| `http://localhost:3000/superadmin`     | Platform Console — Super Admin only (Gökhan Eski)  |
| `http://localhost:3000/app`            | Company workspace — company users / company admins |

---

## Route architecture

| Route group           | URL prefix    | Purpose                                              |
| --------------------- | ------------- | ---------------------------------------------------- |
| `app/(platform)`      | `/superadmin` | Platform Owner only. Companies, packages, limits.    |
| `app/(company)`       | `/app`        | Per-company ERP for Company Admins / Company Users.  |
| `app/login`           | `/login`      | Authentication (Phase 2).                            |

The two route groups have **separate layouts** to keep Super Admin and Company contexts visibly distinct (see [docs/DESIGN_DIRECTION.md](docs/DESIGN_DIRECTION.md) and [docs/SUPERADMIN_RULES.md](docs/SUPERADMIN_RULES.md)).

---

## Scripts

| Script              | Purpose                              |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Start the Next.js dev server on :3000 |
| `npm run build`     | Production build                     |
| `npm run start`     | Run the production build             |
| `npm run lint`      | Next.js + ESLint                     |
| `npm run typecheck` | `tsc --noEmit` strict check          |

---

## What's intentionally NOT here yet

- Real authentication (Phase 2)
- Multi-tenant database tables and RLS policies (Phase 3)
- Super Admin features (Phase 4)
- ERP modules: recipes, materials, production, QC, costing (Phase 5)
- e-Fatura, e-İrsaliye, GİB integrations — **out of MVP scope**

Don't add any of the above ahead of its phase.
