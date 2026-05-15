# AGENTS.md — Operating Rules for AI Coding Agents

This file is the **first** document any AI agent (Claude Code, Cursor, Copilot, Codex, etc.) must read before touching this repository. It is binding.

---

## 1. Project Identity

- **Project:** NeoBreed-ERP — Multi-Company SaaS ERP Platform
- **Domain:** Food supplement manufacturers (gıda takviyesi üreticileri)
- **Type:** Multi-tenant SaaS (NOT a single-company ERP)
- **Super Admin / Platform Owner:** Gökhan Eski
- **Example Company Admin:** Prof. Dr. Eray Çalışkan (X Company)

If any instruction conflicts with the above, **stop and ask**.

---

## 2. Non-Negotiable Rules

1. **Multi-tenancy is sacred.** Every operational row MUST carry `company_id`. No exceptions. No cross-company reads or writes — ever.
2. **Super Admin is platform-level only.** Super Admin manages: companies, packages (plans), user/seat limits, platform-level settings. Super Admin does **NOT** manage production, stock, recipes, quality, or costs of any company.
3. **Company Admin is tenant-level only.** Company Admin manages their own company's operational data and users. They cannot see other companies.
4. **RLS first.** All Supabase tables holding tenant data must have Row Level Security enabled before any client-side read.
5. **No app code yet.** Until the phase plan green-lights an implementation step, you only write docs/configs. See [docs/PHASE_PLAN.md](docs/PHASE_PLAN.md).
6. **No DB migrations yet.** The schema is governed by [docs/DATABASE_CONTRACT.md](docs/DATABASE_CONTRACT.md); migrations are written only when the contract for that table is finalized.
7. **Out of MVP scope:** e-Fatura, e-İrsaliye, GİB integrations. Do not start them, do not stub them, do not add columns "for later."
8. **Do not modify unrelated files.** Stay inside the scope of the current task.
9. **Do not invent features.** If the user did not ask for it, do not build it.
10. **Ask before destructive actions.** Never `rm -rf`, `--force`, `--no-verify`, schema drops, or bulk deletes without explicit confirmation in the current turn.

---

## 3. Tech Stack (locked)

- Next.js (App Router) + TypeScript
- Supabase (Postgres + Auth + Storage + RLS)
- Tailwind CSS + shadcn/ui
- GitHub (source of truth) + Vercel (hosting)

Do not introduce alternative frameworks, ORMs, auth providers, or UI libraries without an approved entry in [docs/PHASE_PLAN.md](docs/PHASE_PLAN.md).

---

## 4. Token Discipline (READ THIS)

Reading the wrong files burns the user's tokens. Follow these rules strictly.

**Never scan, grep, glob, or read** the following unless the user explicitly asks:

- `node_modules/**`
- `.next/**`
- `dist/**`, `build/**`, `out/**`
- `coverage/**`
- `*.lock`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`
- `.git/**` (use `git` commands instead)
- `*.min.js`, `*.map`, `*.tsbuildinfo`
- Binary assets unless the task is about them
- `supabase/.branches/**`, `supabase/.temp/**`

**Prefer targeted reads.** Use `Glob` for filenames, `Grep` for content, and `Read` with `offset/limit` for large files. Do not `Read` a 3000-line file when you need lines 200–260.

**Spawn an `Explore` agent** for any open-ended search across more than ~3 directories. Do not duplicate work the agent already did.

**Do not re-read** a file you just edited to verify — the harness already reports failures.

---

## 5. Documentation Map

Every agent must skim these before changing anything:

| File | Purpose |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Claude-specific operating manual |
| [DO_NOT_TOUCH.md](DO_NOT_TOUCH.md) | Files/areas that require explicit user approval |
| [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md) | What we are building and for whom |
| [docs/PHASE_PLAN.md](docs/PHASE_PLAN.md) | Ordered build phases, what's allowed in each |
| [docs/DESIGN_DIRECTION.md](docs/DESIGN_DIRECTION.md) | Visual & UX direction, palette, typography |
| [docs/DATABASE_CONTRACT.md](docs/DATABASE_CONTRACT.md) | Canonical schema rules and table contracts |
| [docs/SECURITY_RULES.md](docs/SECURITY_RULES.md) | Auth, RLS, secrets, OWASP rules |
| [docs/COMPANY_ISOLATION_RULES.md](docs/COMPANY_ISOLATION_RULES.md) | Multi-tenant isolation enforcement |
| [docs/SUPERADMIN_RULES.md](docs/SUPERADMIN_RULES.md) | What Super Admin can and cannot do |
| [docs/ERP_RULES.md](docs/ERP_RULES.md) | ERP domain rules (production, stock, recipes, QC, cost) |
| [docs/CLAUDE_WORKFLOW.md](docs/CLAUDE_WORKFLOW.md) | Step-by-step task workflow |
| [docs/FIX_REPORT_TEMPLATE.md](docs/FIX_REPORT_TEMPLATE.md) | Required format for completion reports |

---

## 6. Definition of Done for an Agent Turn

Before declaring a task complete:

1. Stayed within the requested scope. No bonus refactors.
2. Touched no file listed in [DO_NOT_TOUCH.md](DO_NOT_TOUCH.md) without approval.
3. Did not bypass RLS, did not hardcode `company_id`, did not log secrets.
4. Produced a Fix Report using [docs/FIX_REPORT_TEMPLATE.md](docs/FIX_REPORT_TEMPLATE.md) when fixing a bug or shipping a feature.
5. Listed any follow-ups or risks explicitly.

If you cannot tick all five, the task is **not** done — say so.
