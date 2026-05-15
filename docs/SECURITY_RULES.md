# SECURITY_RULES.md

Security is a hard constraint, not a phase. These rules apply from the first line of code.

---

## 1. Authentication

- **Provider:** Supabase Auth only (email/password to start; OAuth providers are a later decision).
- **Sessions:** Use `@supabase/ssr` for cookie-based sessions on the server. The browser client uses Supabase's anon key only.
- **Session refresh:** `middleware.ts` runs `supabase.auth.getUser()` on protected routes so the cookie is refreshed.
- **Password policy:** minimum length 10, no max length cap, no forced character classes. Block known-breached passwords (HIBP-style) if/when introduced.
- **Logout** destroys the server cookie and the client session in one action.

---

## 2. Authorization

- Two **distinct** axes: **platform** (Super Admin) and **company** (Company Admin, Company User).
- Authorization is enforced **at the database** via RLS *and* at the server (route handlers / server actions) — defense in depth.
- A user's role is read from `platform_admins` (for Super Admin) and `company_users.role` (for company role) on every server request that needs it. **Never trust a role passed in a header, query, or body.**
- Sensitive Super Admin actions are gated by a server-side check that the caller is in `platform_admins`. RLS alone is not enough for platform mutations.

---

## 3. Row Level Security (RLS)

- **RLS on, always.** Every table that holds user-visible or tenant data must have RLS enabled at creation time.
- Policies use the canonical pattern in `DATABASE_CONTRACT.md`.
- No "open" policies (`using (true)`) on tenant tables.
- The `service_role` key bypasses RLS — therefore it lives **only** in server runtime env vars and is used only by server code paths that explicitly need it (e.g., Super Admin create-company flow).

---

## 4. Secrets

- All secrets live in environment variables. Vercel project env vars in production; `.env.local` in development.
- **Never** import a secret into a `"use client"` file or a file under `app/` without `"server-only"`.
- The Supabase anon key may reach the client. The Supabase service role key must **never** reach the client.
- Never log a secret. Never `console.log(process.env)`.
- `.env*` files are gitignored from day one and listed in `DO_NOT_TOUCH.md`.

---

## 5. Input Validation

- Every server action validates inputs at the boundary with `zod` (once introduced) before touching the DB.
- Never trust query string values for IDs without verifying tenancy.
- Never accept `company_id` from request bodies — derive it from the validated session/active-company context.
- File uploads: validate MIME type and size on the server; store under `company_id/` prefix in Storage.

---

## 6. Output / Rendering

- React escapes by default — fine. Do not use `dangerouslySetInnerHTML` on user-supplied content.
- Avoid rendering HTML from the DB. If markdown is needed later, sanitize it.
- Avoid leaking internal IDs of *other* tenants in error messages — return generic 404s for "not yours or doesn't exist."

---

## 7. CSRF, XSS, SQLi, SSRF

- **CSRF:** Server actions are protected by Next.js's built-in same-origin enforcement and by Supabase cookie scoping. No custom CSRF token unless we add a non-form-action mutation surface.
- **XSS:** No `dangerouslySetInnerHTML` on untrusted input. CSP added in Phase 6 hardening.
- **SQLi:** All DB access via Supabase client — parameterized. Never string-concatenate SQL. Raw SQL goes through the `supabase.rpc(...)` mechanism with typed params.
- **SSRF:** Never fetch a URL from a user-supplied value on the server without an allowlist.

---

## 8. Storage Security

- Buckets are private by default.
- Object paths begin with `company_id/`.
- RLS policies on `storage.objects` mirror the SQL membership check.
- Public asset buckets (e.g., a company logo intentionally public) require an explicit decision and entry in the database contract.

---

## 9. Logging & Audit

- No PII or secrets in logs.
- Super Admin actions are recorded in `platform_audit_log` (see `DATABASE_CONTRACT.md` and `SUPERADMIN_RULES.md`).
- Operational mutations (production orders created, QC sign-offs, stock movements) are recorded in a per-company `audit_log` table introduced in Phase 5.

---

## 10. Dependencies

- Lock down dependencies via the package manager's lockfile.
- Renovate / Dependabot can be enabled in Phase 6; until then, dependency updates are deliberate and reviewed.
- No copy-pasting random npm snippets into the app; vet maintainers and recent activity.

---

## 11. Backups & Recovery

- Use Supabase's managed backups for the DB.
- Document a restore drill before going live with real tenants (Phase 6).
- No production-data exports stored locally on developer machines.

---

## 12. Reporting & Response

If a security issue is found mid-task:
1. **Stop the task.**
2. Tell the user immediately in chat.
3. Open a Fix Report using `FIX_REPORT_TEMPLATE.md`.
4. Do not push or deploy partial fixes.
