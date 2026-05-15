# DO_NOT_TOUCH.md

Files, folders, and configurations that **must not** be changed without explicit, in-turn approval from the user (Gökhan Eski).

---

## 1. Governance Documents (read-only by default)

- `AGENTS.md`
- `CLAUDE.md`
- `DO_NOT_TOUCH.md`
- `docs/PROJECT_BRIEF.md`
- `docs/PHASE_PLAN.md`
- `docs/DESIGN_DIRECTION.md`
- `docs/DATABASE_CONTRACT.md`
- `docs/SECURITY_RULES.md`
- `docs/COMPANY_ISOLATION_RULES.md`
- `docs/SUPERADMIN_RULES.md`
- `docs/ERP_RULES.md`
- `docs/CLAUDE_WORKFLOW.md`
- `docs/FIX_REPORT_TEMPLATE.md`

You may **propose** edits to these in a response, but do not write to them unless the user says "update the doc" (or equivalent).

---

## 2. Security & Secrets

- `.env`, `.env.local`, `.env.production`, `.env.*` — never read, never write, never commit.
- Any file under `.vercel/`.
- Any file containing a Supabase service role key, JWT secret, OAuth client secret, or API key.
- `supabase/config.toml` — change only with approval.

If a secret leaks into a file by mistake, stop and tell the user immediately. Do not try to "scrub" the file silently.

---

## 3. Database Layer

- All files under `supabase/migrations/**` — migrations are append-only and authored deliberately.
- RLS policy SQL files — once written, edits require a Fix Report.
- Database seed files for production data — never edit without approval; dev seeds are fine.

---

## 4. Generated / Vendor Code

- `components/ui/**` — shadcn-generated primitives. Re-generate via the CLI; do not hand-edit.
- `node_modules/**` — obviously off-limits.
- `.next/**`, `dist/**`, `build/**`, `out/**`, `coverage/**` — build outputs.
- Any auto-generated types file (e.g., `database.types.ts` from Supabase CLI). Regenerate, don't edit.

---

## 5. CI / Deploy / Platform

- `.github/workflows/**` — CI is shared infrastructure; changes need approval.
- `vercel.json` — deploy config.
- `package.json` scripts section — propose changes, don't silently rewrite.
- Lockfiles (`package-lock.json`, `pnpm-lock.yaml`, etc.) — never hand-edit. Use the package manager.

---

## 6. Multi-Tenancy Boundary Files

Once these exist, they are load-bearing for isolation. Edit only with explicit approval and a Fix Report:

- The Supabase server client factory (typical path: `lib/supabase/server.ts`).
- The Supabase browser client factory (`lib/supabase/client.ts`).
- The middleware that resolves the active company (`middleware.ts`).
- Any `getActiveCompanyId()` / `requireCompanyId()` helper.
- RLS policy definitions for tenant tables.

---

## 7. Branding & Identity

- Project name (`NeoBreed-ERP`) and owner identity (Gökhan Eski) — do not rename or substitute.
- Company example name (Prof. Dr. Eray Çalışkan, X Company) — used in docs only; do not seed as real data.

---

## 8. What "Touch" Means

"Touch" includes: editing, deleting, renaming, moving, regenerating, reformatting, or auto-fixing via a linter.

If a tool (formatter, codemod, lint --fix) is about to change one of these files as a side effect, **stop the tool** and ask first.
