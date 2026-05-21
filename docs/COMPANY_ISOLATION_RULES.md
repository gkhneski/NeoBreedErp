# COMPANY_ISOLATION_RULES.md

The single most important property of this platform: **no company can ever see, read, modify, or delete another company's data.** This document encodes how that property is achieved and audited.

If an engineering decision threatens this property, the decision is wrong.

---

## 1. Definition

**Company isolation** means: given any HTTP request, the only rows the database returns are rows belonging to companies the requesting user is a member of, **and** to the currently active company in that user's session.

Isolation must hold:
- In the database (RLS) — primary defense.
- In the server code (explicit `company_id` filters and `requireCompanyId()` checks) — secondary defense.
- In the URL structure (the active company is unambiguous and validated server-side) — UX defense.

---

## 2. Identity of a Company

- Every company has a `companies.id uuid` primary key.
- Companies are never deleted carelessly. Suspend, archive, or soft-delete — but never `DELETE FROM companies WHERE id = ...` without explicit user sign-off.

---

## 3. Membership

- A user is a member of a company only if a row exists in `company_users` with `(user_id, company_id)` and `deleted_at is null`.
- A user may belong to multiple companies (future-proof). The active one is determined per-request.
- Roles inside a company: `company_admin`, `production_manager`, `quality_manager`, `operator`, `viewer`. Legacy/demo memberships may still use `company_user`, which maps to broad MVP operational access until reassigned.

---

## 4. Active Company Resolution (server-side only)

The active `company_id` for a request is derived **exclusively from the URL path segment**. Cookies are not used to carry the active company.

1. **Path is canonical.** All company-scoped routes live under `/c/:companyId/...` where `:companyId` is the company's UUID. A future enhancement may introduce a human-readable `slug` column on `companies`; until then, the UUID is the path identifier.
2. **Validate** the path `:companyId` against `company_users` for the current `auth.uid()`. If no membership row exists, treat as 404 (not 403) to avoid leaking existence.
3. **Cache** the resolved id in the request scope only — never in a module-level variable, never in localStorage for security decisions.

Why path over cookie: shareable links are unambiguous, multi-tab usage cannot drift between companies, and RLS debugging is straightforward (the active tenant is visible in the URL).

Client code may *display* the active company but must not *decide* it.

---

## 5. The `requireCompanyId()` Helper (canonical contract)

Every server action and protected route handler that touches tenant data must begin with a call equivalent to:

```ts
const { user, companyId } = await requireCompanyId();
```

Behavior:
- If unauthenticated → redirect to login.
- If no active company resolvable → redirect to company picker.
- If user is not a member of the active company → 404.
- Returns a typed `{ user, companyId }` for downstream use.

Server actions never accept `companyId` as a parameter from the client.

---

## 6. Database-Level Enforcement

- RLS policies as documented in `DATABASE_CONTRACT.md` are the floor, not the ceiling.
- Even if a server bug forgot a `where company_id = ...` filter, RLS will return zero rows for non-members.
- This is why **service role usage is restricted** to platform tables. A service-role bypass on a tenant table defeats RLS.

---

## 7. Storage Isolation

- Every object's path begins with `company_id/`.
- Storage policies on `storage.objects` enforce that path prefix matches a `company_id` the user belongs to.
- Signed URLs are short-lived (≤ 15 minutes) and generated server-side after `requireCompanyId()` validation.

---

## 8. Search & Aggregation

- There is **no cross-company search**, even for Super Admin, on operational data.
- Platform-level metrics for Super Admin are **aggregate only** (counts, sums of platform usage) and computed from platform tables or aggregated views — never by reading operational rows.

---

## 9. Background Jobs

- Any background job (cron, webhook handler, queue worker) that touches tenant data must accept a `company_id` argument and enforce it the same way as a request:
  - Load membership / context for the user *or* operate as a system principal with explicit, audited intent.
  - Use the per-company Supabase client created with a JWT scoped to that company's context, or use service role only when strictly necessary and log the action to the audit table.

---

## 10. Testing Isolation (Phase 6)

- Every tenant table needs an integration test that:
  - Seeds two companies (A and B).
  - Authenticates as a user of A.
  - Asserts they cannot read or write any row of B.
- These tests run against a real Postgres instance (not mocked) so RLS actually executes.

---

## 11. Common Mistakes to Avoid

- **Accepting `company_id` from the client.** Never. Always derive server-side.
- **Disabling RLS to debug.** Use a separate seed user; don't disable RLS.
- **Joining across all companies for an admin chart.** Build aggregates from platform-level summary tables instead.
- **A "magic" account that sees everything.** No such account exists in the product.
- **Logging `company_id` of *other* tenants when a user hits a 404.** Don't.

---

## 12. If You Suspect a Leak

1. Stop the task immediately.
2. Notify the user in chat.
3. Reproduce the leak with a minimal test case (two seeded tenants).
4. Open a Fix Report (`FIX_REPORT_TEMPLATE.md`) labeled `severity: critical`.
5. Coordinate the fix with the user before any deploy.
