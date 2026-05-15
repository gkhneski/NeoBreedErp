# FIX_REPORT_TEMPLATE.md

Use this template whenever a task fixes a bug, ships a feature increment, changes the schema, or touches security/isolation. Paste it into the PR description or the chat summary, filling each section.

Keep it short. Bullet points beat paragraphs. Do not invent metrics.

---

```markdown
## Fix Report

**Title:** <short, specific — e.g., "Add company_id RLS to materials table">

**Type:** bug | feature | schema | security | isolation | docs
**Severity (if bug):** low | medium | high | critical
**Phase:** <Phase 0..6 per docs/PHASE_PLAN.md>
**Touches DO_NOT_TOUCH files?:** no | yes — list and reason

---

### 1. Summary
One or two sentences. What changed and why.

### 2. Root Cause (if a bug)
The actual underlying reason, not the symptom. If a security or isolation issue, name the exact gap (e.g., "missing `with check` clause on RLS policy lets cross-tenant insert succeed").

### 3. Changes
- File: `path/to/file.ext` — what changed in this file.
- File: `path/to/another.ext` — what changed.
(One bullet per file. Keep it tight.)

### 4. Multi-Tenancy Check
- [ ] All new tables carry `company_id`.
- [ ] RLS enabled on all new tables before any insert.
- [ ] No `company_id` accepted from the client.
- [ ] `requireCompanyId()` (or `requirePlatformAdmin()`) used in every new server entry point.
- [ ] No cross-tenant read/write path introduced.

### 5. Super Admin vs Company Admin Check
- [ ] No Super Admin code reads operational tables.
- [ ] No Company UI mounted in the platform layout (or vice versa).
- [ ] No shared route handler mixes the two role axes.

### 6. Security Check
- [ ] No secrets in client code.
- [ ] No `dangerouslySetInnerHTML` on untrusted input.
- [ ] Inputs validated at the server boundary.
- [ ] No new public Storage paths without explicit approval.

### 7. Verification
What you actually did to confirm the change works. Be specific.
- Type check: pass / not run (why)
- Lint: pass / not run (why)
- Manual UI run-through: golden path + which edge case
- Isolation test (if applicable): seeded tenants A and B, asserted A cannot see B's rows

### 8. Risks & Follow-ups
- Known limitations.
- Things deliberately left for later (link to the future ticket or note).
- Anything the user should sign off on before merge / deploy.

### 9. Out of Scope (explicit)
What this change does NOT do, to prevent scope creep accusations later.
```

---

## Notes for the Author

- If you check a box you didn't actually verify, that is dishonest. Leave it unchecked and explain.
- "Verification" must describe real observation, not aspiration. "I ran the dev server and created a production order as user A; as user B I got a 404" is acceptable. "It should work" is not.
- For schema changes, include the migration filename and confirm RLS in the same migration.
- For isolation/security fixes, write the section as if a reviewer will challenge every claim — because they should.
