# NeuPharma Storefront — Project Brief & Build Spec

> **Read this first, read it fully, and treat it as the contract.**
> This document is the complete handoff for an AI agent (or engineer) building the **NeuPharma direct‑to‑consumer e‑commerce storefront** as a **separate repository, separate Supabase project and separate Vercel project**. It describes the business, the architecture decision, the integration contract with the NeoBreed ERP, the data model, the checkout/stock/payment flows, the doctor referral program, Turkish legal requirements, the UI/UX design brief, the delivery phases, and the definition of done.
>
> Owner: Gökhan Eski (platform owner, Super Admin of NeoBreed ERP). Conversation language: Turkish. Code, docs, commit messages: English. On‑screen storefront copy: Turkish (tr‑TR).

---

## 0. TL;DR for the building agent

1. You are building **`neupharma-shop`** — a full‑scope B2C store (catalog → cart → checkout → payment → order tracking → accounts → doctor referral codes → admin) for a Turkish food‑supplement brand.
2. It is **NOT** part of the ERP repo. New repo, new Supabase project, new Vercel project. Never import ERP code; never connect to the ERP database directly.
3. The **ERP is the system of record for products, stock, orders, fulfilment and finance.** The shop talks to it only through the **Channel API** defined in §5. Stock comes from the **LTD.ŞTİ. depot** in the ERP.
4. The **shop is the system of record for**: storefront content, retail prices & campaigns, carts, consumer accounts, payments, coupons, the doctor referral program, reviews.
5. Stack: Next.js 15 (App Router, RSC, server actions), TypeScript strict, Tailwind, shadcn/ui, **21st.dev Magic** components, Framer Motion, Supabase (Postgres + Auth + Storage), zod, iyzico (3‑D Secure), Resend (e‑mail), Netgsm (SMS), Upstash (rate limit), Sentry, Vercel.
6. Before writing any UI: run the **`frontend-design`** skill, pick ONE anchor, state it, and hold it. Use **UI/UX Pro Max + 21st.dev Magic** (see §11) for components. Modern commerce quality bar: Ritual, Seed, Aesop, Hims, Apple Store. No AI‑slop.
7. Ship in the phases of §13. Each phase ends with typecheck + tests green, a Vercel deploy, and a short report.
8. Everything you do not know is listed in §15 (Open decisions). Do not block on them — build with the stated default and flag.

---

## 1. Business context

| Item | Fact |
|---|---|
| Brand | **NeuPharma** (public marketing site already uses this name) |
| Products | Food supplements ("gıda takviyesi"): vitamins, minerals, botanical blends. Sold as **boxes** ("kutu"); each box has `units_per_pack` tablets/capsules. |
| Market | Türkiye only at launch. Currency **TRY**. Prices shown **KDV dahil**. Language tr‑TR. i18n‑ready but single locale. |
| Legal entity selling | NeuPharma LTD.ŞTİ. (the ERP models it as the second depot of the single tenant, see §4.3) |
| Existing channels | Trendyol (via ERP marketplace chain), B2B pharmacy portal inside ERP, a public catalog/SEO site inside ERP (`/urunler`, `/urun/[slug]`, `/rehber`) that currently links out to Trendyol to buy. |
| Goal | Own D2C channel with: (a) normal consumer sales, (b) a **doctor referral program** — doctors get a personal code; a patient using the code gets a discount; the doctor accrues a commission (hakediş) settled monthly. |
| Ambition | "Tam kapsamlı" — a real store, not a landing page: search, filters, bundles, coupons, guest checkout, 3DS payment, installments, cargo tracking, returns, accounts, wishlists, reviews, e‑mail/SMS notifications, admin panel, analytics, SEO. |

Why a separate system (decision already made by the owner — do not re‑litigate):
- ERP is a **multi‑tenant SaaS** with per‑company RLS. A public, anonymous, high‑traffic, payment‑webhook‑receiving surface must not share its auth, DB or blast radius.
- Different scale profile (campaign spikes, bots, crawlers) and different release cadence.
- The ERP already treats marketplaces as *channels*; the shop is just another channel.

---

## 2. Architecture

```
┌──────────────────────┐   HTTPS + API key + HMAC   ┌──────────────────────────┐
│  neupharma-shop      │ ─────────────────────────▶ │  NeoBreed ERP            │
│  Next.js on Vercel   │   Channel API v1 (§5)      │  Next.js on Vercel       │
│  Supabase (shop DB)  │ ◀───────────────────────── │  Supabase (ERP DB)       │
│                      │   Signed webhooks (§5.6)   │                          │
│  • storefront        │                            │  • materials (products)  │
│  • cart/checkout     │                            │  • material_lots (stock) │
│  • payments (iyzico) │                            │  • sales_orders          │
│  • consumer auth     │                            │  • shipments / cargo     │
│  • doctor program    │                            │  • finance (hakediş)     │
│  • admin panel       │                            │  • Trendyol channel      │
└──────────────────────┘                            └──────────────────────────┘
```

Principles:
- **Single source of truth per fact.** Product identity/SKU/barcode/pack size → ERP. Stock → ERP (LTD depot). Order lifecycle after payment → ERP. Retail price, content, images for the web, campaigns, coupons, referral codes, consumer PII → shop.
- **Shop never writes to ERP DB. ERP never writes to shop DB.** Only the API + webhooks.
- **Idempotency everywhere** across the boundary (`Idempotency-Key` header, unique external refs).
- **Cache, don't couple.** The shop keeps a local mirror of products and stock (`inventory_cache`) refreshed by webhooks + periodic pull, so the storefront renders even if the ERP is down. Only **reservation** and **order creation** are synchronous calls.
- **Security boundary:** `SUPABASE_SERVICE_ROLE_KEY` and `ERP_API_SECRET` exist only in server code (`import "server-only"`). Browser gets anon key only. RLS on every table.

---

## 3. Repos, environments, deployment

### 3.1 Repositories
- **`neupharma-shop`** (new) — this project. Default branch `main`, work on feature branches, PRs, squash merge. Commit convention: `feat(scope): …`, `fix(scope): …`, `chore: …`.
- **`NeoBreed-ERP`** (existing, separate agent) — implements the ERP side of the Channel API (§5 + §14). You do not touch it. If the contract must change, write the proposed change in `docs/ERP_CONTRACT_CHANGES.md` in your repo and stop for owner approval.

### 3.2 Supabase (shop)
- New project, region **Frankfurt (eu‑central‑1)**. Migrations in `supabase/migrations/` (`YYYYMMDDHHMMSS_name.sql`, append‑only, applied with `npx supabase db push`). Hand‑maintained `types/database.ts` kept in sync.
- Auth: email+password, magic link, Google OAuth. Phone OTP later.
- Storage buckets: `product-media` (public read), `doctor-documents` (private), `order-documents` (private; invoices/PDFs).
- Enable `pg_cron` only if Vercel cron proves insufficient; default to Vercel cron.

### 3.3 Vercel
- New project, region `fra1`. Production domain: `neupharma.com.tr` (placeholder — owner confirms, §15). Preview deployments per PR. `vercel --prod --yes` after merge (owner's convention).
- Cron jobs (`vercel.json`): `pull-erp-stock` every 10 min (safety net for missed webhooks), `expire-reservations` every 5 min, `abandoned-cart-emails` hourly, `referral-monthly-close` on the 1st at 03:00.

### 3.4 Environment variables (names)
```
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ERP_API_BASE_URL              # e.g. https://<erp-domain>/api/channel/v1
ERP_API_KEY                   # public identifier issued by ERP
ERP_API_SECRET                # HMAC secret issued by ERP, server-only
ERP_WEBHOOK_SECRET            # for verifying inbound ERP webhooks
IYZICO_API_KEY
IYZICO_SECRET_KEY
IYZICO_BASE_URL               # sandbox vs api.iyzipay.com
RESEND_API_KEY
NETGSM_USERCODE / NETGSM_PASSWORD / NETGSM_HEADER
UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
SENTRY_DSN
CRON_SECRET
NEXT_PUBLIC_ANALYTICS_ID      # Plausible or GA4
```
Never commit `.env*`. Provide `.env.example` with names only.

---

## 4. ERP facts you must respect (verified against the ERP repo)

### 4.1 Products
- ERP has **no `products` table**. A sellable product is a row in `materials` with `type = 'finished'`.
- Key columns: `id (uuid)`, `code` (internal SKU, e.g. `MAM-…`), `name`, `barcode` (EAN/GTIN — the universal join key, also used for Trendyol), `units_per_pack` (tablets per box), `base_uom`, `fason_customer_id` (contract‑manufactured for a customer → **never sellable on the shop**), `deleted_at` soft delete.
- ERP has **no retail price, no VAT rate, no categories, no web content**. `product_catalog.sale_price` is the **B2B pharmacy price — do not use it as retail**. The marketing site keeps a `price_snapshot` in `site_product_pages`. **Retail price is owned by the shop** (see §6.1) unless the owner decides otherwise (§15).
- Images: ERP stores a product thumbnail and Trendyol images in a private bucket; a public route `GET /api/public/product-image/{companyId}/{productId}/{idx}` serves them. Use it only as an initial import source; the shop hosts its own optimized media.

### 4.2 Stock
- Finished goods live in `material_lots` as **boxes** (`quantity_on_hand`), each lot with `expiry_date` (SKT), `status ∈ {quarantine, released, blocked}`, `location_id`, `owner_customer_id`.
- **Sellable = Σ quantity_on_hand where status='released' AND owner_customer_id IS NULL AND deleted_at IS NULL AND quantity_on_hand > 0** — and for the shop additionally **`location_id` = the LTD depot** (or its child shelves).
- ERP has **no reservation concept today**; stock is decremented only when a shipment is shipped (FEFO lot pick at conversion). The Channel API adds reservations (§5.3) — until the ERP ships that endpoint, the shop must run in **"optimistic" mode** (§7.4) and the owner accepts the oversell window.
- SKT matters: the ERP already runs SKT‑based automatic discounts on Trendyol. The Channel API exposes `nearest_expiry` per product so the shop can show "Son kullanma: 03/2027" and run the same kind of campaigns (§6.4).

### 4.3 Company / depot
- Single ERP tenant for the brand: `companies.id = 4f73f01a-5467-4a2a-8616-b8c17f274ba5` ("NeuPharma A.Ş.").
- The selling entity's depot: `locations.id = 8bf8c994-764f-4a7e-bad5-676cf94fdf2b` ("NeuPharma LTD.ŞTİ.", `kind='depot'`). The ERP's Channel API key will be **bound to this company + this location**; the shop never sends `company_id` or `location_id` — the key implies them.

### 4.4 Orders & fulfilment
- `sales_orders`: `code` (`SIP-000001`), `customer_id NOT NULL`, `status ∈ {placed, confirmed, preparing, shipped, cancelled}`, `source` (currently `portal|rep|manual`; ERP will add **`web`**), `shipment_id`.
- `sales_order_items`: `material_id, quantity, unit_price` — **no discount/tax/total columns**. So the shop sends the **net unit price actually paid per line** (after discounts, VAT‑inclusive) as `unit_price`, and sends full commercial detail in `metadata` for reporting.
- `shipments`: `code (SVK-…)`, `channel ∈ {ecza, trendyol, hepsiburada, diger}` (ERP will add **`web`**), `carrier`, `tracking_no`, `status ∈ {open, preparing, shipped, cancelled}`, `external_order_no` (← shop order number), `recipient`.
- Depot operators in the ERP see finished goods only; they prepare and ship. The **shop never handles physical fulfilment**; it only displays status/tracking received via webhook.
- **Invoicing (e‑Arşiv) does not exist in the ERP and is out of ERP scope.** See §9.4 for how the shop handles it.

### 4.5 Existing marketing site → migration plan
- ERP serves `/`, `/urunler`, `/urun/[slug]`, `/rehber`, `/rehber/[slug]` from tables `site_product_pages`, `site_articles` (owner‑approved SEO copy, JSON‑LD, sitemap). Site is `noindex` until a domain is attached.
- The shop **replaces** that site. **Keep the same URL slugs** (`/urun/{slug}`, `/rehber/{slug}`) so nothing is lost; import the published copy via the Channel API `GET /content/*` endpoints (§5.7) once, then own it in the shop CMS. When the domain moves, the ERP site goes dark or 301s to the shop.

---

## 5. Channel API v1 — the ERP ↔ shop contract

The ERP agent builds the server; you build the client (`lib/erp/client.ts`) and the webhook receiver. **Code against this spec exactly.** Base path on the ERP: `/api/channel/v1`. JSON only, UTF‑8, `Content-Type: application/json`. All timestamps ISO‑8601 UTC. All money as **decimal strings** (`"249.90"`, dot decimal, no thousands separator) with `currency: "TRY"`. Quantities are integers (boxes).

### 5.1 Authentication (both directions)
Headers on every shop→ERP request:
```
X-Api-Key: <ERP_API_KEY>
X-Timestamp: <unix seconds>
X-Signature: hex(HMAC-SHA256(ERP_API_SECRET, `${timestamp}\n${METHOD}\n${path}\n${sha256(body)}`))
Idempotency-Key: <uuid>          # required on POST/PATCH/DELETE
```
ERP rejects if `|now - timestamp| > 300s`, if signature mismatches, if key disabled, or if the Idempotency‑Key was seen with a different body (409). Same key + same body → returns the original response (200/201). Rate limit: 600 req/min per key; `429` with `Retry-After`.

Error envelope (all non‑2xx):
```json
{ "error": { "code": "OUT_OF_STOCK", "message": "…", "details": { "material_id": "…", "available": 3 } } }
```
Codes: `UNAUTHORIZED, SIGNATURE_INVALID, IDEMPOTENCY_CONFLICT, VALIDATION_ERROR, NOT_FOUND, OUT_OF_STOCK, RESERVATION_EXPIRED, RESERVATION_ALREADY_CONSUMED, ORDER_ALREADY_EXISTS, RATE_LIMITED, INTERNAL`.

### 5.2 Products & stock
`GET /products?updated_since=<iso>&cursor=&limit=200`
```json
{ "data": [ {
    "id": "uuid",
    "sku": "MAM-0007",
    "barcode": "8680000000000",
    "name": "Diofol Folik Asit 60 Tablet",
    "units_per_pack": 60,
    "base_uom": "adet",
    "sellable": true,
    "available_qty": 142,
    "nearest_expiry": "2027-03-31",
    "updated_at": "2026-08-28T10:00:00Z"
  } ], "next_cursor": null }
```
- `id` = `materials.id` (the shop's `erp_material_id`); `sku` = `materials.code`.
- `sellable` = false if fason / deleted / not released for web.
- `available_qty` = sellable boxes at the LTD depot **minus active reservations**.
- `nearest_expiry` = earliest released lot SKT at that depot, or null.

`GET /products/{id}` → single. `GET /stock?ids=uuid,uuid` → `[{ id, available_qty, nearest_expiry }]` (cheap poll; used by the 10‑min cron and by PDP on cache miss).

### 5.3 Reservations (soft‑lock, TTL)
`POST /reservations`
```json
{ "reference": "cart_01H…", "ttl_seconds": 900,
  "lines": [ { "material_id": "uuid", "quantity": 2 } ] }
```
→ `201 { "id": "res_…", "expires_at": "…", "lines": [ { "material_id": "…", "quantity": 2 } ] }` or `409 OUT_OF_STOCK` with per‑line `available`.
`PATCH /reservations/{id}` `{ "ttl_seconds": 900 }` → extend (during 3DS). `DELETE /reservations/{id}` → release. Expired reservations are released by the ERP automatically. A reservation is consumed atomically by `POST /orders`.

### 5.4 Orders
`POST /orders` (call **only after payment is captured**):
```json
{
  "external_order_no": "NP-2026-000123",
  "reservation_id": "res_…",
  "placed_at": "2026-08-28T10:05:00Z",
  "customer": { "external_id": "uuid-of-shop-user-or-guest", "name": "…", "email": "…", "phone": "+90…",
                "tax_number": null, "type": "individual" },
  "shipping_address": { "name": "…", "line1": "…", "line2": "", "district": "…", "city": "…", "postal_code": "…", "country": "TR", "phone": "+90…" },
  "billing_address": { "name": "…", "line1": "…", "line2": "", "district": "…", "city": "…", "postal_code": "…", "country": "TR",
                       "company_name": null, "tax_office": null, "tax_number": null },
  "lines": [ { "material_id": "uuid", "quantity": 2, "unit_price": "224.91", "list_unit_price": "249.90",
               "discount_total": "49.98", "vat_rate": 10, "line_total": "449.82" } ],
  "totals": { "subtotal": "499.80", "discount": "49.98", "shipping": "0.00", "vat_included": "40.89", "grand_total": "449.82", "currency": "TRY" },
  "payment": { "provider": "iyzico", "method": "card", "installments": 1, "transaction_id": "…", "paid_at": "…" },
  "referral": { "code": "DRK7M2Q4", "doctor_external_id": "uuid", "patient_discount": "49.98", "doctor_commission": "22.49" },
  "coupon": { "code": null, "discount": "0.00" },
  "notes": "Kapıya bırakın",
  "metadata": { "utm_source": "…", "device": "…" }
}
```
- `reservation_id` is optional in optimistic mode; `referral` and `coupon` may be null.
- → `201 { "erp_order_id": "uuid", "erp_order_code": "SIP-000045", "status": "placed" }`.
- ERP side: upsert `customers` row keyed by `external_id` (code `WEB-…`), create `sales_orders(source='web')`, items with `unit_price` = net paid, store the whole payload in `sales_orders.channel_payload jsonb`, consume the reservation. Second call with the same `external_order_no` → `200` with the existing ids.

`GET /orders/{erp_order_id}` → `{ "status": "…", "shipment": { "code", "carrier", "tracking_no", "status", "shipped_at" } | null }`.
`POST /orders/{erp_order_id}/cancel` `{ "reason": "customer_request" }` → allowed only while `status ∈ {placed, confirmed}`; otherwise `409`.
`POST /orders/{erp_order_id}/return` `{ "lines": [ { "material_id", "quantity" } ], "reason": "…" }` → creates a return intent in the ERP; ERP confirms via webhook `order.returned`.

### 5.5 Referral statements (doctor program)
The **shop is the system of record** for doctors, codes, usage and monthly statements (§8). The ERP only needs (a) the per‑order `referral` block above for reporting and (b) a monthly statement so finance can pay:
`POST /referral-statements`
```json
{ "period": "2026-09",
  "doctors": [ { "external_id": "uuid", "name": "Dr. …", "iban_masked": "TR** **** 1234", "orders": 12, "commission_total": "1240.00", "currency": "TRY" } ] }
```
→ `201 { "statement_id": "uuid" }`. ERP stores it and finance books payouts in its accounts module; ERP emits `referral_statement.paid` per doctor when paid.

### 5.6 Webhooks ERP → shop
Endpoint you expose: `POST /api/webhooks/erp`. Headers: `X-Webhook-Id`, `X-Timestamp`, `X-Signature` (HMAC‑SHA256 over `${timestamp}.${rawBody}` with `ERP_WEBHOOK_SECRET`). Respond `2xx` within 5 s; do work asynchronously (insert into `webhook_inbox`, process by queue/cron). ERP retries with backoff for 24 h; dedupe on `X-Webhook-Id`.
Events (`{ "id", "type", "occurred_at", "data" }`):
- `stock.changed` → `{ material_id, available_qty, nearest_expiry }`
- `product.updated` → product shape from §5.2
- `order.status_changed` → `{ erp_order_id, external_order_no, status }`
- `shipment.shipped` → `{ erp_order_id, external_order_no, carrier, tracking_no, shipped_at }`
- `order.cancelled`, `order.returned` → `{ erp_order_id, external_order_no, lines?, reason }`
- `referral_statement.paid` → `{ period, doctor_external_id, amount, paid_at }`

### 5.7 Content import (one‑time)
`GET /content/product-pages` and `GET /content/articles` → published rows from `site_product_pages` / `site_articles` (slug, title, meta, body markdown/HTML, og_image_url, faq, price_snapshot). Used once by `scripts/import-erp-content.ts`; afterwards the shop CMS owns the content.

### 5.8 Client implementation rules
- `lib/erp/client.ts`: typed methods per endpoint, zod‑validated responses, 10 s timeout, 3 retries with jitter for idempotent GETs, **no retries on POST /orders except with the same Idempotency‑Key**.
- Every call logged to `erp_sync_log` (endpoint, status, latency, request id). Alert on error rate > 5 % in 5 min (Sentry).
- Feature flag `ERP_MODE = "reserve" | "optimistic"` — until the ERP ships reservations, run `optimistic` (§7.4).

---

## 6. Shop data model (Supabase, shop project)

All tables `public.*`, `uuid` PKs (`gen_random_uuid()`), `created_at/updated_at` (trigger), soft delete (`deleted_at`) on master data. Money `numeric(12,2)`; quantities `integer`. RLS on **every** table; policies in §6.8. Admin/staff identity via `staff_users(user_id, role ∈ {owner, admin, support, content})`.

### 6.1 Catalog
- `categories(id, slug, name, parent_id, sort, seo_title, seo_description, image_path, is_visible)`
- `products(id, erp_material_id uuid UNIQUE, sku, barcode UNIQUE, slug UNIQUE, name, subtitle, units_per_pack, form ('tablet'|'kapsül'|'saşe'|'şurup'|'diğer'), category_id, brand DEFAULT 'NeuPharma', status ('draft'|'active'|'archived'), list_price, sale_price NULL, vat_rate int DEFAULT 10, is_sellable_from_erp bool, weight_grams, tags text[], search_vector tsvector, seo_title, seo_description, og_image_path, ministry_approval_no, published_at)`
  - Retail price policy: `list_price` = crossed‑out reference price; `sale_price` = current price if lower. Both **KDV dahil**. `vat_rate` default 10 % for supplements (owner confirms, §15).
- `price_history(product_id, price, effective_at)` — required for the 30‑day reference‑price rule (§9.7).
- `product_content(product_id PK, description_md, usage_md, ingredients_md, warnings_md, faq jsonb, nutrition_table jsonb)`
- `product_media(id, product_id, storage_path, alt, sort, kind ('image'|'video'))`
- `product_bundles(id, slug, name, price, status)` + `bundle_items(bundle_id, product_id, quantity)`
- `inventory_cache(product_id PK, available_qty, nearest_expiry, synced_at, source ('webhook'|'poll'))`
- `stock_alerts(id, product_id, email, user_id NULL, notified_at NULL)`
- `product_reviews(id, product_id, user_id, order_id, rating 1‑5, title, body, status ('pending'|'approved'|'rejected'), verified_purchase bool)`

Availability rule for the UI: `available_qty − (this shop's active local reservations, in optimistic mode)`; show **"Stokta"**, **"Son N adet"** when ≤ `low_stock_threshold` (default 5), **"Tükendi"** at 0 with "Gelince haber ver".

### 6.2 Customers
- Supabase `auth.users` + `profiles(user_id PK, first_name, last_name, phone, birth_date NULL, marketing_opt_in, kvkk_accepted_at)`
- `addresses(id, user_id, label, name, phone, line1, line2, district, city, postal_code, country 'TR', is_default_shipping, is_default_billing, invoice_type ('individual'|'corporate'), company_name, tax_office, tax_number)`
- Guest checkout: no user row; identity = e‑mail + phone captured on the order; order lookup by `order_no + email`. Offer "hesap oluştur" post‑purchase (magic link).
- `wishlists(user_id, product_id)`, `newsletter_subscribers(email, source, confirmed_at)`

### 6.3 Cart & checkout
- `carts(id, user_id NULL, session_token (httpOnly cookie), status ('open'|'converted'|'abandoned'), coupon_code, referral_code, expires_at)`
- `cart_items(cart_id, product_id NULL, bundle_id NULL, quantity, unit_price_snapshot)`
- `reservations(id, cart_id, erp_reservation_id NULL, expires_at, status ('active'|'consumed'|'released'|'expired'), lines jsonb)`

### 6.4 Pricing, campaigns, coupons
- `coupons(id, code UNIQUE upper, kind ('percent'|'fixed'|'free_shipping'), value, min_subtotal, max_uses, max_uses_per_customer, starts_at, ends_at, applies_to ('all'|'categories'|'products'), target_ids uuid[], stackable_with_referral bool DEFAULT false, is_active)`
- `coupon_redemptions(coupon_id, order_id, user_id NULL, email)`
- `campaigns(id, name, kind ('expiry_discount'|'bundle'|'seasonal'), rules jsonb, starts_at, ends_at, is_active)` — first implementation: **SKT‑based discount ladder** mirroring the ERP's Trendyol ladder (`max_days_left → discount_percent`), driven by `inventory_cache.nearest_expiry`. Show "Yakın SKT indirimi — SKT: 03/2027" transparently on PDP and cart.
- `shipping_rules(id, carrier, base_fee, free_over, regions jsonb, is_active)` — default: single flat fee, free over a threshold (§15).

Price resolution order per line: base (`sale_price ?? list_price`) → campaign → referral code discount (patient %) → coupon (only if `stackable_with_referral` or no referral) → shipping rule. Store the full breakdown per order line. Never recompute historical orders from current prices.

### 6.5 Orders & payments
- `orders(id, order_no UNIQUE 'NP-YYYY-NNNNNN', user_id NULL, email, phone, status ('pending_payment'|'paid'|'sent_to_erp'|'erp_failed'|'confirmed'|'preparing'|'shipped'|'delivered'|'cancelled'|'refunded'|'partially_refunded'|'returned'), erp_order_id, erp_order_code, subtotal, discount_total, shipping_total, vat_total, grand_total, currency, shipping_address jsonb, billing_address jsonb, invoice_type, referral_code, doctor_id, referral_patient_discount, referral_doctor_commission, coupon_code, coupon_discount, notes, ip, user_agent, utm jsonb, distance_contract_accepted_at, preinfo_form_accepted_at, placed_at, paid_at, shipped_at, delivered_at, cancelled_at)`
- `order_items(id, order_id, product_id, erp_material_id, name_snapshot, sku, barcode, quantity, list_unit_price, unit_price, discount_total, vat_rate, line_total)`
- `payments(id, order_id, provider 'iyzico', method ('card'|'bank_transfer'), status ('initiated'|'threeds_pending'|'success'|'failed'|'refunded'|'partially_refunded'), amount, installments, provider_payment_id, provider_conversation_id, card_last4, card_brand, raw_response jsonb, error_code, error_message)`
- `refunds(id, payment_id, amount, reason, provider_refund_id, status)`
- `shipments(id, order_id, erp_shipment_code, carrier, tracking_no, tracking_url, status, shipped_at, delivered_at)`
- `order_events(id, order_id, type, data jsonb, actor ('system'|'customer'|'staff'|'erp'), created_at)` — append‑only timeline shown in admin and (filtered) to the customer.
- `invoices(id, order_id, provider, provider_invoice_id, number, pdf_path, issued_at, status)` — see §9.4.
- `order_documents(id, order_id, kind ('preinfo_form'|'distance_contract'), pdf_path, accepted_at)`
- `returns(id, order_id, status ('requested'|'approved'|'rejected'|'received'|'refunded'), lines jsonb, reason, customer_note, staff_note)`

### 6.6 Doctor referral program
- `doctors(id, user_id NULL, title, first_name, last_name, specialty, city, phone, email, diploma_no, clinic_name, status ('applied'|'verified'|'active'|'suspended'|'closed'), iban, iban_holder, tax_number NULL, payout_type ('individual'|'company'), verified_at, verified_by, notes)` — `doctors.id` is the `doctor_external_id` sent to the ERP.
- `doctor_documents(doctor_id, kind ('diploma'|'id'|'invoice'), storage_path)`
- `referral_codes(id, doctor_id, code UNIQUE (8 chars, uppercase, no 0/O/1/I), patient_discount_percent int, doctor_commission_percent int, commission_base ('net_paid'|'list'), max_uses NULL, per_customer_monthly_limit int DEFAULT 4, starts_at, ends_at, is_active)`
- `referral_usages(id, referral_code_id, doctor_id, order_id UNIQUE, customer_email_hash, order_net, patient_discount_amount, doctor_commission_amount, status ('pending'|'eligible'|'cancelled'|'paid'), eligible_at, statement_id NULL)`
- `referral_statements(id, doctor_id, period 'YYYY-MM', orders_count, commission_total, status ('open'|'closed'|'sent_to_erp'|'paid'), closed_at, paid_at, erp_reference)`
- `referral_settings(singleton: default_patient_discount_percent, default_doctor_commission_percent, min_payout_amount, holdback_days DEFAULT 14)`

### 6.7 Content & ops
- `pages(slug, title, body_md, status)` (hakkımızda, iletişim, KVKK, mesafeli satış, iade, çerez, SSS)
- `articles(slug, title, excerpt, body_md, cover_path, status, published_at, seo_title, seo_description)` (imported `/rehber/*`)
- `banners(id, slot ('hero'|'promo_bar'|'plp_top'), title, subtitle, cta_label, cta_href, media_path, starts_at, ends_at, is_active)`
- `webhook_inbox(id, source, external_id UNIQUE, type, payload jsonb, received_at, processed_at, error)`
- `erp_sync_log(id, endpoint, method, status_code, latency_ms, request_id, error)`
- `email_log(id, to_email, template, order_id, provider_id, status)`, `sms_log(id, to_phone, template, order_id, provider_id, status)`
- `audit_log(id, actor_user_id, action, entity, entity_id, diff jsonb)`
- `settings(key PK, value jsonb)` (store name, contact, free‑shipping threshold, low‑stock threshold, maintenance mode…)

### 6.8 RLS policy matrix (summary)
| Table group | anon | authenticated (customer) | staff | service role |
|---|---|---|---|---|
| categories, products (active), product_content, product_media, bundles, inventory_cache, pages, articles (published), reviews (approved), banners (active) | select | select | all | all |
| carts, cart_items | none (server handles via session token with service role) | own rows | all | all |
| profiles, addresses, wishlists | none | own rows | select | all |
| orders, order_items, payments, shipments, returns, invoices, order_documents, order_events | none | own rows (select; return request insert) | all | all |
| coupons, campaigns, shipping_rules, settings, price_history | none | none | all | all |
| doctors, referral_codes, referral_usages, referral_statements | none | own doctor rows (via `doctors.user_id`) | all | all |
| webhook_inbox, erp_sync_log, email_log, sms_log, audit_log | none | none | select | all |

Write paths for customers go through **server actions** that validate with zod and use the user's cookie‑bound client (`@supabase/ssr`); privileged writes (order creation, payment webhooks, ERP sync) use the service‑role client in `server-only` modules.

---

## 7. Core flows

### 7.1 Catalog rendering
- PLP/PDP are **RSC with ISR** (`revalidate = 300`) + `revalidateTag('product:{id}')` on `product.updated` / `stock.changed` webhooks. Stock badge on PDP fetched client‑side from `/api/stock/{id}` (edge, 30 s cache) so ISR pages never show stale "Stokta".
- Search: Postgres full‑text (`search_vector`, Turkish config + `unaccent`) with typo tolerance via `pg_trgm`; instant search overlay with recent/popular queries.
- Filters: category, form, price range, "stokta olanlar", ingredient tags. URL‑state (`?kategori=&form=&fiyat=`).

### 7.2 Cart
- Server‑side cart keyed by httpOnly `cart_token` cookie; merged into the user's cart on login. Cart drawer (slide‑over) updates optimistically; line prices re‑resolved on every mutation. Show savings, free‑shipping progress bar, SKT notice when applicable, referral/coupon field.

### 7.3 Checkout (single page: İletişim → Teslimat → Ödeme)
1. Contact (e‑mail, phone) → guest or login.
2. Address (Türkiye il/ilçe picker; corporate invoice toggle with vergi dairesi/no).
3. Shipping method (from `shipping_rules`).
4. Payment: iyzico **Checkout Form** (hosted, minimal PCI scope) or card form + 3DS init; installments table by BIN.
5. Legal checkboxes: **Ön Bilgilendirme Formu** and **Mesafeli Satış Sözleşmesi** (rendered with the actual order data, stored as PDF in `order_documents`), KVKK notice link.
Order number reserved at "Ödemeye geç" (`status='pending_payment'`).

### 7.4 Stock reservation & payment sequence
```
Ödemeye geç
 ├─ mode=reserve:    POST ERP /reservations (ttl 15m) → 409 → show per-line "sadece N adet" and stop
 ├─ mode=optimistic: check inventory_cache − local active reservations; insert local reservations row
 ├─ create order (pending_payment), snapshot prices & legal docs
 ├─ iyzico initialize (3DS) → redirect/iframe → callback POST /api/payments/iyzico/callback
 │    ├─ success: verify with iyzico retrieve API (never trust the callback alone) → payments.success, orders.paid
 │    │           → enqueue "send_to_erp" (POST /orders with reservation_id, Idempotency-Key = order id)
 │    │           → success: orders.sent_to_erp → confirmed, store erp ids
 │    │           → failure: orders.erp_failed, alert, retry job (backoff 1m→1h for 24h), admin "ERP'ye yeniden gönder"
 │    └─ failure/timeout: payments.failed, release reservation (ERP DELETE or local); order stays pending_payment 30 min, then cancelled
 └─ expire-reservations cron: release expired local/ERP reservations
```
Money is captured **before** the order reaches the ERP; if the ERP fails permanently, staff either fix and resend or refund — the customer is always e‑mailed a confirmation as soon as payment succeeds.

### 7.5 After the order
- `order.status_changed` / `shipment.shipped` webhooks → update `orders`, `shipments`, insert `order_events`, send **"Siparişiniz kargoya verildi"** e‑mail + SMS with tracking link (carrier deep‑link map: Yurtiçi, Aras, MNG, PTT, Sürat, Trendyol Express… by carrier code).
- Delivery: poll carrier or mark manually in admin; `delivered` starts the 14‑day return window and the referral `holdback`.
- Cancel by customer allowed while `≤ confirmed` → `POST /orders/{id}/cancel` → refund via iyzico → `cancelled`.
- Returns: customer opens request from account (reason, photos) → staff approves → customer ships back → ERP `order.returned` webhook (stock re‑entry happens in ERP) → refund.

### 7.6 Notifications (Resend + Netgsm; React Email templates; Turkish)
Order confirmation, payment failed, shipped (+SMS), delivered, cancelled, refund issued, return approved/received, back‑in‑stock, abandoned cart (1 h & 24 h, opt‑in only), account magic link, doctor application received/approved, monthly doctor statement. All templates branded, mobile‑first, with order summary and legal footer (company name, address, MERSİS/vergi no).

---

## 8. Doctor referral program (hekim referans programı)

**Purpose:** a doctor recommends a product; the patient enters the doctor's code at checkout and receives a discount; the doctor accrues a commission paid monthly.

**Flow**
1. Doctor applies at `/hekim/basvuru` (name, unvan, uzmanlık, diploma no, klinik, şehir, e‑posta, telefon, IBAN, payout type, document upload, program terms + KVKK consent).
2. Staff verifies in admin → status `active`; a personal code is generated (`DR` + 6 chars, e.g. `DRK7M2Q4`), optionally a custom vanity code; default rates from `referral_settings` (owner defaults: **patient −10 %**, **doctor 10 % of net paid** — confirm §15).
3. Doctor portal `/hekim` (Supabase auth, role = doctor): dashboard (this month's orders, eligible commission, pending holdback, lifetime), code + share tools (QR, WhatsApp/SMS deep link with `?ref=CODE`), statement history with PDF, profile/IBAN, program terms.
4. Patient path: `?ref=CODE` in any URL → cookie 30 days → auto‑applied in cart; or manual entry in cart/checkout. Validation: active, within dates, usage limits, not self‑use (doctor's own e‑mail), one referral per order. The discount line reads "Referans indirimi (DRK7M2Q4) −%10".
5. On `paid`: `referral_usages(pending)`; on `delivered + holdback_days` → `eligible`; cancel/return → `cancelled` (proportional if partial). Monthly close (cron, 1st of month): eligible usages → `referral_statements(period)`; `POST /referral-statements` to the ERP; e‑mail statement to the doctor; ERP `referral_statement.paid` webhook → `paid`.
6. Admin: doctors list/verify/suspend, codes & rates per doctor, usages, statements, export CSV/XLSX, manual adjustment with audit.

**Anti‑abuse:** code cannot be applied by the doctor's own account/e‑mail/IP; cap uses per customer per month (default 4); fraud flags on refund ratios; rates changeable only forward‑dated.

**Legal flag (do not skip):** advertising food supplements with health‑professional endorsement and paying commissions to physicians is regulated in Türkiye (Gıda Kodeksi etiketleme/reklam kuralları; Sağlık Bakanlığı rules for physicians). Implement the program as a neutral **"Referans Programı"** with no public "doktor tavsiyesi" claims on product pages; keep program terms editable in CMS; the owner is verifying with a lawyer (§15). Nothing in the storefront copy may present a product as "doktor onaylı".

---

## 9. Turkish e‑commerce compliance checklist (must‑have before launch)

1. **Mesafeli Satış Sözleşmesi** & **Ön Bilgilendirme Formu** — generated per order with real data, accepted via checkbox, stored (PDF) and e‑mailed with confirmation. Templates in CMS.
2. **Cayma hakkı (14 gün)** — supplements: returns accepted only if unopened/seal intact; state it clearly in the pre‑info form and the return policy page.
3. **KVKK** — Aydınlatma Metni, Açık Rıza (marketing), Çerez Politikası + cookie consent banner (analytics off until consent), data‑subject request form, retention rules; `kvkk_accepted_at` on profile/order.
4. **e‑Arşiv fatura** — every B2C order needs an e‑Arşiv invoice. The ERP has no invoicing. Default plan: shop integrates an **e‑fatura service provider API** (Paraşüt / BizimHesap / Foriba / Sovos — owner picks, §15) and issues the invoice at `shipped` (or `paid`, per accountant), stores the PDF in `invoices`, e‑mails it. Provide an `InvoiceProvider` interface + `ManualInvoiceProvider` fallback (staff uploads PDF) so launch isn't blocked.
5. **ETBİS** registration; footer with company name, address, MERSİS, vergi no, KEP, contact.
6. **Product compliance** — show Tarım ve Orman Bakanlığı onay/kayıt no per product (`ministry_approval_no`); mandatory warnings ("Takviye edici gıdalar normal beslenmenin yerine geçemez…", "Tavsiye edilen günlük porsiyonu aşmayın", "Çocukların ulaşamayacağı yerde saklayın", pregnancy/illness notice) as a fixed PDP block; **no disease/treatment claims**; a CMS‑level claim linter (deny‑list of forbidden phrases) on product content.
7. **Fiyat etiketi / indirim kuralları** — the crossed‑out price must be the lowest price of the last 30 days when showing a discount (Ticaret Bakanlığı rule). Compute the reference price from `price_history`.
8. Accessibility (WCAG 2.1 AA); the store must work with only essential cookies.

---

## 10. Admin panel (`/admin`, staff only)

Dashboard (today's revenue/orders/AOV, ERP sync health, stock‑outs, failed payments, pending returns, doctor applications) · Orders (list/filter/search, detail with timeline, resend to ERP, refund, cancel, notes) · Products (content, media, prices with scheduled changes, SEO, bundles, publish; ERP fields read‑only with "ERP'den güncellendi" timestamp) · Inventory (cache view + manual resync) · Campaigns & coupons · Doctors (program) · Reviews moderation · Content (pages, articles, banners, mega‑menu) · Customers (search, orders, KVKK export/delete) · Shipping rules · Settings · Logs (webhook inbox, sync log, e‑mail/SMS log) · Staff & roles · Audit log. Built with shadcn/ui data tables; server‑side pagination; every mutation audited.

---

## 11. UI/UX design brief — "en modern commerce"

### 11.1 Process (mandatory)
1. Run the **`frontend-design`** skill. State the problem in one sentence, pick **one anchor** (lean unexpected; do not default to generic "clean SaaS"), state the differentiator, and lock the tokens. Document the choice in `docs/DESIGN.md` with palette, type scale, spacing, radius, motion rules.
2. Install & use **UI/UX Pro Max** (`npm i -g uipro-cli && uipro init --ai claude`) for style/palette/font‑pairing exploration, and **21st.dev Magic MCP** (`npx -y @21st-dev/magic@latest`, API key from https://21st.dev/magic/console — ask the owner for the key, never invent one) to pull production‑grade components: navbar/mega‑menu, hero, product cards, pricing/bundle blocks, testimonials, FAQ accordion, footer, dialog/drawer, toasts, skeletons. Adapt every pulled component to the locked tokens — never ship them with default styling.
3. **Framer Motion** for: page transitions, cart drawer, add‑to‑cart micro‑interaction, scroll‑reveal on marketing sections, product gallery. Respect `prefers-reduced-motion`.
4. Content discipline (from the skill): every string is real product information or deliberately authored copy. No fake reviews, no invented stats, no placeholder personas, no "AI register" subcopy. If real content is missing, leave the slot empty and list it in `CONTENT_TODO.md` for the owner (owner‑approved copy comes from the ERP content import).

### 11.2 Brand direction constraints
- Brand: NeuPharma. Positioning: **scientific, calm, trustworthy, premium but accessible** — pharmacy‑grade clarity, not wellness‑influencer noise. The existing marketing site uses Plus Jakarta Sans + emerald/forest green; you may evolve it but keep green as the primary accent for continuity. Light theme first; dark mode optional later.
- References for the quality bar (study, do not copy): ritual.com, seed.com, aesop.com, hims.com, thorne.com, apple.com/store. Note their PDP structure, sticky buy box, trust strip, ingredient transparency, and checkout minimalism.
- Photography: real product renders/photos supplied by the owner (`product_media`); until then use neutral empty‑state placeholders (no stock photos of random pills).

### 11.3 Page inventory & UX requirements
| Page | Must have |
|---|---|
| Home `/` | Hero with one clear promise + primary CTA; category tiles; bestsellers (real data or hidden); trust strip (Bakanlık onaylı, GMP üretim, 14 gün iade, güvenli ödeme, ücretsiz kargo eşiği); ingredient‑transparency section; guide articles; newsletter; referral program teaser (neutral wording). |
| PLP `/urunler`, `/kategori/[slug]` | Grid 2/3/4 cols, filters drawer on mobile & sidebar on desktop, sort, quick‑add, stock badges, SKT‑discount badge, skeletons, pagination or infinite scroll with URL state. |
| PDP `/urun/[slug]` | Gallery (zoom, thumbnails, video), title/subtitle, price with reference‑price rule, units_per_pack & günlük porsiyon, sticky buy box (qty, add to cart, installments hint), stock & SKT line, delivery estimate, accordion: Açıklama, Kullanım, İçindekiler (nutrition table), Uyarılar (fixed legal block), SSS; reviews (approved only); bundles/"birlikte alınanlar"; JSON‑LD Product/Offer/Breadcrumb/FAQ; share. |
| Cart drawer & `/sepet` | Line edit, savings, free‑shipping progress, referral/coupon field with inline validation, cross‑sell, "Ödemeye geç". |
| Checkout `/odeme` | Single page, autosave, il/ilçe picker, address book for logged‑in, corporate invoice toggle, payment (iyzico), installments, legal checkboxes, sticky order summary, per‑line stock error states. |
| Success `/siparis/[no]/tesekkurler` | Order summary, timeline, create‑account CTA (guest), invoice/contract downloads. |
| Tracking `/siparis-takip` | order_no + e‑mail → status timeline + carrier link. |
| Account `/hesabim/*` | Orders, order detail (timeline, return request), addresses, profile, wishlist, reviews, KVKK actions. |
| Doctor `/hekim/*` | Application, login, dashboard, code/share tools, statements, profile. |
| Content | `/rehber`, `/rehber/[slug]`, `/hakkimizda`, `/iletisim` (form → e‑mail), `/sss`, legal pages. |
| System | Designed 404/500, maintenance mode, search overlay, cookie banner, ERP‑down banner ("Stok bilgisi güncelleniyor"). |

### 11.4 Performance & quality budgets
LCP < 2.5 s (mobile 4G), CLS < 0.05, INP < 200 ms; `next/image` with AVIF/WebP; fonts self‑hosted via `next/font`; no layout shift on price/stock hydration; Lighthouse ≥ 90 on all four categories for Home/PLP/PDP; PDP < 180 kB JS gzip.

---

## 12. Engineering standards

- Next.js 15 App Router; **RSC by default**, client components only for interaction; **server actions** for mutations with zod schemas in `lib/validation/*`; `import "server-only"` in every module touching service role/ERP secrets.
- Folder layout: `app/(store)/…`, `app/(account)/hesabim`, `app/(doctor)/hekim`, `app/(admin)/admin`, `app/api/{webhooks,payments,stock,cron,health}`, `lib/{erp,payments,invoicing,notifications,pricing,cart,supabase,validation}`, `components/{ui,store,admin}`, `emails/`, `supabase/migrations`, `scripts/`, `tests/{unit,e2e}`, `docs/`.
- TypeScript strict, no `any` without `// reason:`; ESLint + Prettier; `pnpm`.
- Tests: Vitest for the pricing engine, referral rules, ERP client signing, webhook verification; Playwright e2e for browse → cart → checkout (iyzico sandbox) → order visible in account; RLS tests (pgTAP or SQL scripts) asserting a customer cannot read another's order.
- Observability: Sentry (server + client), structured logs (`pino`) with request ids, `/api/health` (DB + ERP ping + iyzico ping).
- Security: Upstash rate limits on auth, checkout, coupon/referral validation, contact form; CSP + security headers; HMAC verification on all webhooks; idempotency keys; input normalization (phone E.164, IBAN checksum); secrets only in Vercel env; no PII in logs; KVKK deletion routine.
- Docs you maintain in the repo: `README.md` (setup), `docs/ARCHITECTURE.md`, `docs/DATABASE_CONTRACT.md` (your tables + RLS), `docs/ERP_INTEGRATION.md` (copy of §5 + status of each endpoint), `docs/DESIGN.md`, `docs/LEGAL_CHECKLIST.md`, `docs/RUNBOOK.md` (ERP down, payment provider down, resend order, refund).

---

## 13. Delivery phases (each = PR + deploy + report)

| Phase | Scope | Exit criteria |
|---|---|---|
| **P0 Foundation** | Repo, Next.js, Tailwind, shadcn, design tokens (`docs/DESIGN.md`), Supabase project, base migrations (catalog, settings, staff), auth, layout shell, CI (typecheck/lint/test), Vercel project, Sentry, `.env.example`. | Deploys; empty store renders with the locked design system. |
| **P1 Catalog** | Products/categories/content/media, ERP product import (`GET /products`) + content import (§5.7), PLP/PDP/search/filters, inventory cache + stock badge, SEO/JSON‑LD/sitemap, price‑history rule. | Real products browsable; Lighthouse ≥ 90. |
| **P2 Cart & Checkout** | Cart, pricing engine, shipping rules, coupons, checkout UI, iyzico sandbox 3DS, legal docs generation, order + payment tables, notifications. Optimistic stock mode. | Sandbox purchase end‑to‑end; e‑mails delivered. |
| **P3 ERP order sync** | ERP client with HMAC, `POST /orders`, retry queue, webhook receiver, order status/tracking pages, cancel/return flows. Reservation mode behind flag. | Orders appear in ERP as `source='web'`; shipped webhook updates the shop. |
| **P4 Accounts** | Customer accounts, addresses, order history, wishlist, reviews, guest→account, KVKK actions. | RLS tests pass. |
| **P5 Doctor program** | Doctors, codes, portal, checkout integration, holdback, monthly statements, `POST /referral-statements`, admin screens. | A sandbox order with a code produces the correct usage + statement. |
| **P6 Admin** | Full admin panel (§10), audit log, log viewers. | Staff can run the store without DB access. |
| **P7 Launch readiness** | Legal pages, e‑Arşiv provider, cookie consent, analytics, redirects from old site slugs, robots/indexing on, domain, checkout load test, runbook. | Owner sign‑off checklist all green. |
| **P8 Growth** | Abandoned cart, back‑in‑stock, bundles, subscriptions (optional), A/B hooks, Trendyol price‑parity view. | — |

Do not start a phase before the previous one's exit criteria are met. If the ERP endpoints for P3 are not live yet, build against a **mock ERP server** (`scripts/mock-erp/`, same contract, in‑memory) and mark P3 "integration pending".

---

## 14. ERP‑side work (for the ERP agent — informational, so both sides align)

The ERP repo must add (own migration + `docs/DATABASE_CONTRACT.md` §21):
1. `channel_api_keys(id, company_id, location_id, name, key_id, secret_hash, enabled, last_used_at)`; `channel_api_requests(idempotency_key, key_id, body_hash, response jsonb, created_at)` for idempotency; `channel_webhook_endpoints(company_id, url, secret, enabled)` + `channel_webhook_deliveries(event_id, endpoint_id, attempts, status, next_retry_at)` (outbox pattern).
2. `stock_reservations(id, company_id, material_id, location_id, quantity, reference, expires_at, status)`; sellable qty at a location = released, unowned lots at that location − active reservations; FEFO pick honours reservations; expiry cron.
3. `sales_orders.source` check → add `'web'`; new columns `sales_orders.external_order_no`, `channel_payload jsonb`, `shipping_address jsonb`; `shipments.channel` → add `'web'`; `customers.external_id` + auto‑create `WEB-…` customers.
4. Route handlers under `app/api/channel/v1/*` (HMAC auth, rate limit, zod); webhook emitter on lot / shipment / order triggers.
5. `referral_statements` + `referral_statement_lines` tables in ERP finance; `account_transactions` booking on payout; emits `referral_statement.paid`.
6. Company settings screen: generate/rotate API key, set webhook URL, choose channel depot (default LTD location).

---

## 15. Open decisions (defaults in bold — build with the default, flag in the report)

1. Domain: **`neupharma.com.tr`** (placeholder) — owner confirms.
2. Retail price source: **shop owns retail prices**; ERP exports none. Alternative: ERP adds `web_price` later.
3. VAT rate for supplements: **10 %** (owner/accountant confirms; configurable per product).
4. Payment provider: **iyzico** (alternatives: PayTR, Param). Bank transfer/EFT as secondary: **yes, manual confirmation in admin**.
5. e‑Arşiv provider: **undecided — build `InvoiceProvider` interface + manual fallback**; owner picks Paraşüt/BizimHesap/Foriba/Sovos.
6. Carriers & fees: **single flat fee 79,90 TL, free over 750 TL** (placeholders); carrier names arrive from the ERP as free text.
7. Doctor program defaults: **patient −10 %, doctor 10 % of net paid, holdback 14 days, min payout 500 TL, monthly**; legal review pending; public program name: **"Referans Programı"**.
8. Reservation mode: **optimistic until the ERP ships `/reservations`**, then flip `ERP_MODE=reserve`.
9. Reviews: **enabled, verified‑purchase only, moderated**.
10. Subscriptions ("abonelik"): **not in scope until P8**.
11. Analytics: **Plausible** (cookie‑less) + optional GA4 behind consent.

---

## 16. Definition of done & reporting

A phase is done when: typecheck, lint, unit + e2e tests are green; migrations applied to the shop Supabase; deployed to Vercel (preview → prod after owner OK); `docs/*` updated; no secrets in git; RLS verified; Lighthouse budgets met for touched pages; a **short report** (what shipped, what's mocked/pending, open decisions touched, next phase) is written to `docs/reports/P{n}.md` and summarized in the PR. Reports and commit messages in English; owner communication in Turkish.

When blocked by a missing owner decision: implement the default from §15, isolate it behind a setting/flag, and continue. When blocked by the ERP: use the mock server and continue. Never widen scope silently (no marketplaces, no B2B, no multi‑brand in this repo). Never call the ERP database or reuse ERP credentials.
