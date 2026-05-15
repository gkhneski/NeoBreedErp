# SUPERADMIN_RULES.md

The Super Admin / Platform Owner is **Gökhan Eski**. This document defines exactly what the Super Admin role can and cannot do. The boundary is strict — code that blurs it is a bug.

---

## 1. Identity

- The Super Admin is identified by a row in `platform_admins` (and/or a boolean column on `profiles`, finalized in `DATABASE_CONTRACT.md` when Phase 3 begins).
- Super Admin status is **separate** from any `company_users` membership. A Super Admin is **not** automatically a member of any company.

---

## 2. What Super Admin CAN Do

- Create, suspend, archive, and (with care) delete **companies**.
- Define **packages** (plans): name, description, user/seat limit, feature toggles per package.
- Assign a package to a company; change a company's package.
- Set **user/seat limits** per company (independent of the package default, when needed).
- Invite the first **Company Admin** for a new company.
- View **platform-level metrics**: number of companies, number of active users (aggregate), storage used (aggregate), package distribution.
- Configure **platform-level settings**: email templates for invites, default locale, default currency for new companies.
- View the **platform audit log** (`platform_audit_log`).
- Lock or unlock a company (suspend access without deleting data).

Every Super Admin write action is recorded in `platform_audit_log` with the actor's `user_id`, action, target, and timestamp.

---

## 3. What Super Admin CANNOT Do

- **Read** a company's recipes, formulations, materials, lots, production orders, batches, quality records, or cost records.
- **Write** to any operational table of any company.
- **Impersonate** a Company Admin or Company User (not in MVP — possibly later with explicit audit trail and consent).
- **Download** a company's files from Storage.
- **Bypass RLS** on operational tables. The service role key is used only for platform-table mutations.
- **See** which specific raw materials, suppliers, customers, or batch numbers a company is using.

If a Super Admin needs operational visibility for support, the only legitimate path will be a documented, opt-in, consent-logged "support session" with a full audit trail. That mechanism is **explicitly out of scope for MVP** and is not implemented yet.

---

## 4. UI Separation

- Super Admin lives under a **dedicated route group**, e.g., `app/(platform)/admin/...`.
- Super Admin layout is **visually distinct** from the company app (per `DESIGN_DIRECTION.md`).
- Super Admin and Company Admin **never** share a layout, navigation, or sidebar.
- A user who is both a Super Admin and a Company Admin (rare; example: Gökhan owning a test company) must explicitly switch between platform mode and company mode.

---

## 5. Server-Side Enforcement

Every Super Admin route handler / server action begins with the equivalent of:

```ts
const { user } = await requirePlatformAdmin();
```

Behavior:
- If unauthenticated → redirect to login.
- If user is not in `platform_admins` → 404 (not 403; do not reveal the existence of the platform area).

`requirePlatformAdmin()` is independent of `requireCompanyId()` and they are **never composed** in a single handler.

---

## 6. Audit Log

- Table: `platform_audit_log`.
- Captures: actor `user_id`, action verb (`create_company`, `change_package`, `set_user_limit`, `suspend_company`, etc.), target id, before/after JSON snapshot for sensitive changes, IP, timestamp.
- Audit log entries are append-only. No update, no delete (enforced by RLS and trigger).
- Super Admin can read the audit log; nobody else can.

---

## 7. Packages (Plans)

- A `package` has: name, description, default user/seat limit, optional feature flags (e.g., `quality_module: true`).
- Companies reference a package. When a package is updated, existing companies do not auto-migrate unless explicitly re-assigned.
- Pricing/billing integration (Stripe etc.) is **not** in MVP — packages are descriptive containers for limits and feature toggles for now.

---

## 8. Company Lifecycle (Super Admin actions)

| Action | Effect |
|---|---|
| Create | New `companies` row, new Supabase Storage prefix, invite the first Company Admin via email. |
| Suspend | Set `companies.status = 'suspended'`. Company users get a friendly "account suspended" screen on next request. No operational data is altered. |
| Resume | Reverse suspension. |
| Archive | Mark `companies.status = 'archived'`. Read-only mode for that tenant. |
| Delete | Soft-delete only by default (`deleted_at`). A hard delete requires user sign-off and a Fix Report. |

---

## 9. Things That Look Like Super Admin Features but Aren't

- "Global search across all tenants" — **no**.
- "See top-selling recipes across all companies" — **no**.
- "View QC failure rate platform-wide" — **only as an aggregate** if it is derived from platform-level usage counters, never from operational rows.
- "Edit a customer's recipe to fix a bug" — **no**. Coordinate with the Company Admin instead.

---

## 10. Why This Is Strict

We are selling tenant isolation as a product property. Any path that lets the Super Admin see operational data — even read-only — turns a SaaS into a hosted spreadsheet from the customer's perspective. The boundary is the product.
