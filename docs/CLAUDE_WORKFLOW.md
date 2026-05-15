# CLAUDE_WORKFLOW.md

How Claude (and any AI agent) should run a task in this repository. Follow it in order.

---

## Step 0 — Receive the Task

- Read what the user asked.
- If something is ambiguous, **ask one focused clarifying question** before proceeding. Don't ask three; pick the one that unblocks the most work.

---

## Step 1 — Locate Yourself

Before touching anything:

1. Confirm the **current phase** in `docs/PHASE_PLAN.md`. If the task is outside the phase, say so and ask whether to defer or advance the phase.
2. Read the **most relevant doc** for the task:
   - Tenant data work → `docs/COMPANY_ISOLATION_RULES.md` + `docs/DATABASE_CONTRACT.md`.
   - Super Admin work → `docs/SUPERADMIN_RULES.md`.
   - UI work → `docs/DESIGN_DIRECTION.md`.
   - Anything touching auth/secrets → `docs/SECURITY_RULES.md`.
   - ERP domain logic → `docs/ERP_RULES.md`.
3. Skim `DO_NOT_TOUCH.md`. If the task forces a touch there, **stop and ask**.

---

## Step 2 — Plan (briefly)

- For a one-file change: a single paragraph in chat is enough.
- For multi-step work: use TaskCreate with a short, ordered list.
- Plans state *what* changes, *which files*, and *why this is in scope*.

---

## Step 3 — Token-Disciplined Discovery

When searching the codebase:

- Use `Glob` for filenames.
- Use `Grep` for content. Prefer `-n` and small `head_limit`s.
- Use `Read` with `offset/limit` for big files.
- Spawn an `Explore` agent for searches that would take more than ~3 queries.
- **Never** scan `node_modules`, `.next`, `dist`, `build`, `coverage`, lockfiles, `*.min.js`, `*.map`.

---

## Step 4 — Implement

- Make focused edits with `Edit` / `Write`.
- One change per concern. Don't refactor surrounding code just because you noticed it.
- Don't add features the user didn't ask for.
- Default to no comments. Add a comment only when the *why* is non-obvious.
- For tenant data: `requireCompanyId()` first, then DB call. Never accept `company_id` from the client.
- For Super Admin: `requirePlatformAdmin()` first. Do not co-locate with tenant logic.

---

## Step 5 — Verify

- For type-checked code (Phase 1+): run `tsc --noEmit` (or the project's typecheck script).
- For UI (Phase 1+): start the dev server and click through the actual feature. Test golden path + at least one edge case.
- For DB work (Phase 3+): seed two tenants and assert isolation.
- Type checks and unit tests verify code correctness, **not feature correctness**. If you can't actually test the UI, say so explicitly — don't claim success you didn't observe.

---

## Step 6 — Report

Produce a **Fix Report** using `docs/FIX_REPORT_TEMPLATE.md` if the task is:
- A bug fix.
- A feature increment.
- A schema change.
- Anything touching security or isolation.

For trivial doc edits or comment changes, a 1–2 sentence summary in chat is enough.

---

## Step 7 — Commit (Only if Asked)

- Never commit without an explicit "commit this" / "ship it" / equivalent from the user.
- Use one new commit per logical change; do not amend.
- Never use `--no-verify` or skip signing.
- Never `git push --force` to `main`. If a force push is requested anywhere, confirm with the user first.

---

## Step 8 — Stop

- Do not start the "next" task on your own initiative.
- The end-of-turn summary is **one or two sentences** — what changed and what's next.

---

## Anti-Patterns to Avoid

- Re-reading a file you just edited "to verify."
- Re-running the same failing command in a loop hoping it works.
- Bypassing RLS to debug instead of seeding a test user.
- Inventing tables/columns/endpoints not present in the contract.
- Generating long planning docs the user didn't ask for.
- Mixing Super Admin and Company Admin concerns in one handler.

---

## When to Stop and Ask

- The task seems to require a destructive action (drop, force, hard delete, bulk modify).
- The task crosses Super Admin ↔ Company Admin boundaries.
- The task contradicts a doc in `docs/`.
- A secret would need to ship to the client to "make it work."
- You are about to touch a file in `DO_NOT_TOUCH.md`.

Pausing to ask is cheap. Undoing a wrong move is expensive.
