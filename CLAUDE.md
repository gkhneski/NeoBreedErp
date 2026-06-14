# CLAUDE.md — Claude Code Operating Manual

This file extends [AGENTS.md](AGENTS.md) with Claude-specific guidance. If anything here conflicts with AGENTS.md, AGENTS.md wins.

---

## 1. Who You Are Working For

- **User / Platform Owner:** Gökhan Eski (Super Admin)
- **Product:** Multi-company SaaS ERP for food supplement manufacturers
- **Language of conversation:** Turkish or English (the user writes in Turkish; you answer in the language of the request)
- **Language of code & docs:** English

The user is the platform owner, not an end user of a single company. When discussing features, always ask: *"Is this a platform-level concern or a company-level concern?"* before designing it.

---

## 2. How to Start Any Task

1. Read AGENTS.md.
2. Read the doc most relevant to the task (e.g., `docs/SUPERADMIN_RULES.md` for Super Admin features).
3. If the task touches DB shape, read `docs/DATABASE_CONTRACT.md` first.
4. If the task touches **UI / layout / dashboards / sidebar / theme**, read `docs/UI_DESIGN_SYSTEM.md` first and keep its conventions.
5. Confirm which **phase** you are in via `docs/PHASE_PLAN.md`. If the task is outside the current phase, push back.
5. Plan briefly (one paragraph) before touching files. For multi-step work, use TaskCreate.

---

## 3. What Claude Must Never Do

- Never write tenant data without `company_id`.
- Never add a "service role" call from a browser context.
- Never paste a Supabase service key into client code.
- Never disable RLS to "make a test pass."
- Never run `supabase db reset`, `DROP TABLE`, or destructive SQL without user confirmation **in the current turn**.
- Never push to `main` directly; PRs only.
- Never commit `.env*` files.
- Never invent endpoints, tables, columns, or routes that aren't in the contract — propose them first.
- Never produce code that mixes Super Admin and Company Admin responsibilities in one route handler.

---

## 4. What Claude Should Do

- Prefer **server components** and **server actions** for anything touching tenant data.
- Prefer **`@supabase/ssr`** for cookie-bound auth on the server.
- Always derive `company_id` from the authenticated session (or active company switcher state), never from the request body.
- Write narrow, composable functions. Three similar lines is fine; one premature abstraction is not.
- Default to **no comments**. Only add a comment when the *why* is non-obvious.
- Keep responses short. End-of-turn summary = 1–2 sentences.

---

## 5. Code Style Defaults

- TypeScript strict mode.
- No `any` unless paired with a `// reason:` note and an issue link.
- Server-only modules import via `import "server-only"` at the top.
- Use `zod` (when introduced) for boundary validation: inputs from forms, query params, and external APIs.
- Tailwind first; reach for a custom CSS file only when Tailwind genuinely can't express it.
- shadcn/ui components live under `components/ui/` and are not edited casually — they are generated.

---

## 6. Token Discipline Recap (Claude-specific)

- Never read `node_modules`, `.next`, `dist`, `build`, `coverage`, lockfiles, `*.min.js`, `*.map`.
- Use `Glob` and `Grep` instead of `Read` when the goal is "find" not "study."
- Use `Read` with `offset/limit` for large files.
- Use `Agent` with `subagent_type: "Explore"` for broad codebase searches (>3 queries).
- Don't re-read a file you just wrote.

---

## 7. When in Doubt

Stop and ask. The user prefers one extra clarifying question over a wrong implementation that has to be torn out.
