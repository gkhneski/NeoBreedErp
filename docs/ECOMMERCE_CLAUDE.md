# CLAUDE.md — NeuPharma Storefront (`neupharma-shop`)

> **How to use this file:** copy it to the root of the `neupharma-shop` repository as `CLAUDE.md`, and copy `ECOMMERCE_STOREFRONT_BRIEF.md` next to it as `docs/BRIEF.md`. Claude Code loads this file automatically on every session; nothing else needs to be written by the owner at session start.

This file is the operating manual for Claude Code in this repository. The full build specification lives in [docs/BRIEF.md](docs/BRIEF.md) and is the contract; if anything here conflicts with the brief, the brief wins.

---

## 1. Who You Are Working For

- **Owner:** Gökhan Eski — platform owner of the NeoBreed ERP and owner of the NeuPharma brand.
- **Product:** `neupharma-shop` — the direct-to-consumer (B2C) e-commerce storefront for a Turkish food-supplement brand: catalog → cart → checkout → payment → order tracking → accounts → doctor referral program → admin.
- **Language of conversation:** the owner writes in Turkish; answer in the language of the request.
- **Language of code, docs, commits, reports:** English.
- **Language of on-screen storefront copy:** Turkish (tr-TR).

The owner is not watching in real time. Do not stop to ask "shall I…?" for reversible work that follows from the brief. Build with the defaults in Brief §15, isolate them behind settings/flags, and flag them in the report.

---

## 2. Project Identity (locked)

- **Separate project.** Own repo, own Supabase project (Frankfurt), own Vercel project (`fra1`). This is **not** the ERP.
- **ERP is the system of record** for products, stock, orders, fulfilment and finance. The shop talks to it **only** through the Channel API v1 (Brief §5). Stock comes from the ERP's LTD.ŞTİ. depot.
- **Shop is the system of record** for storefront content, retail prices & campaigns, carts, consumer accounts, payments, coupons, the doctor referral program, reviews.
- **Stack:** Next.js 15 (App Router, RSC, server actions), TypeScript strict, Tailwind, shadcn/ui, 21st.dev Magic components, Framer Motion, Supabase (Postgres + Auth + Storage), zod, iyzico (3-D Secure), Resend, Netgsm, Upstash, Sentry, Vercel, pnpm.

Do not introduce alternative frameworks, ORMs, auth providers, payment providers or UI libraries without an owner-approved note in `docs/ARCHITECTURE.md`.

---

## 3. How to Start Any Task

1. Read [docs/BRIEF.md](docs/BRIEF.md) §0 (TL;DR) and the section(s) relevant to the task.
2. Confirm the current **phase** (Brief §13, tracked in `docs/reports/`). Do not start a phase before the previous one's exit criteria are met. If the task is outside the current phase, push back in one sentence and continue only if the owner reaffirms.
3. If the task touches DB shape → read `docs/DATABASE_CONTRACT.md` (the shop's own tables + RLS matrix, Brief §6).
4. If the task touches the ERP boundary → read `docs/ERP_INTEGRATION.md` and Brief §5. Never change the contract unilaterally; write the proposal to `docs/ERP_CONTRACT_CHANGES.md` and stop for owner approval.
5. If the task touches **UI** → read `docs/DESIGN.md` and keep the locked tokens. If `docs/DESIGN.md` does not exist yet, run the **`frontend-design`** skill first, pick ONE anchor, and write the file before touching any component (Brief §11.1).
6. Plan briefly (one paragraph). For multi-step work, use TaskCreate.

---

## 4. What Claude Must Never Do

- Never import ERP code, connect to the ERP database, or reuse ERP credentials/service keys.
- Never call the ERP from a browser context; all ERP calls go through `lib/erp/client.ts` in `import "server-only"` modules.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, `ERP_API_SECRET`, `IYZICO_SECRET_KEY`, or any secret to client code.
- Never disable RLS to make something work. Every customer/doctor/order table is RLS-protected before any client-side read.
- Never retry `POST /orders` to the ERP without the **same Idempotency-Key**.
- Never skip HMAC verification on inbound webhooks (`ERP_WEBHOOK_SECRET`) or iyzico callbacks.
- Never store card data. iyzico 3DS only; the shop keeps tokens/references, never PANs.
- Never log PII (name, phone, address, e-mail, IBAN) or secrets. Log request ids.
- Never ship fake content: no invented reviews, stats, testimonials, personas, or stock photos of random pills. Missing content → leave the slot empty and add to `CONTENT_TODO.md`.
- Never ship a 21st.dev / shadcn component with its default styling; adapt it to the locked tokens.
- Never widen scope silently: no marketplaces, no B2B, no multi-brand, no subscriptions before P8.
- Never run `supabase db reset`, `DROP TABLE`, bulk deletes, `rm -rf`, `--force`, or `--no-verify` without owner confirmation **in the current turn**.
- Never push to `main` directly; feature branches + PRs, squash merge.
- Never commit `.env*`. Keep `.env.example` with names only (Brief §3.4).
- Never invent the 21st.dev Magic API key; ask the owner.

---

## 5. What Claude Should Do

- **RSC by default**; client components only for interaction. **Server actions** for mutations, each with a zod schema in `lib/validation/*`.
- Derive the customer/staff identity from the Supabase session on the server, never from the request body.
- Prices, discounts, coupons, referral discounts and VAT are computed **only** by the pricing engine in `lib/pricing/` on the server; the client never sends a price.
- Stock mode follows `ERP_MODE` (`optimistic` until the ERP ships `/reservations`, then `reserve`). Keep both paths behind the flag.
- Every ERP call is typed, zod-validated, 10 s timeout, logged to `erp_sync_log`. If the ERP endpoint is not live, build against `scripts/mock-erp/` and mark the feature "integration pending" in the report.
- Rate-limit auth, checkout, coupon/referral validation and contact form with Upstash.
- Normalize inputs at the boundary: phone → E.164, IBAN checksum, TC kimlik format where required.
- Turkish legal requirements (Brief §9) are launch blockers, not nice-to-haves: Mesafeli Satış Sözleşmesi, Ön Bilgilendirme Formu, KVKK, cerez politikası, cayma hakkı, e-Arşiv via `InvoiceProvider` interface with manual fallback.
- Write narrow, composable functions. Three similar lines is fine; one premature abstraction is not.
- Default to **no comments**; add one only when the *why* is non-obvious.
- Keep responses short. End-of-turn summary = 1–2 sentences, in the owner's language.

---

## 6. Code Style Defaults

- TypeScript strict. No `any` without a `// reason:` note.
- `import "server-only"` at the top of every module touching service role, ERP secrets, payment secrets or cron handlers.
- Folder layout (Brief §12): `app/(store)`, `app/(account)/hesabim`, `app/(doctor)/hekim`, `app/(admin)/admin`, `app/api/{webhooks,payments,stock,cron,health}`, `lib/{erp,payments,invoicing,notifications,pricing,cart,supabase,validation}`, `components/{ui,store,admin}`, `emails/`, `supabase/migrations`, `scripts/`, `tests/{unit,e2e}`, `docs/`.
- Tailwind first; custom CSS only when Tailwind genuinely cannot express it.
- `components/ui/` is generated shadcn — do not edit casually.
- Framer Motion for page transitions, cart drawer, add-to-cart, scroll-reveal, gallery. Always respect `prefers-reduced-motion`.
- Migrations: `supabase/migrations/YYYYMMDDHHMMSS_name.sql`, append-only, applied with `npx supabase db push`. Keep `types/database.ts` in sync in the same PR.
- ESLint + Prettier; `pnpm` only.
- Commits: `feat(scope): …`, `fix(scope): …`, `chore: …`. End commit messages with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## 7. Design Discipline

- Quality bar: Ritual, Seed, Aesop, Hims, Thorne, Apple Store. Study, do not copy. No AI-slop.
- Positioning: scientific, calm, trustworthy, premium but accessible. Green stays the primary accent (continuity with the existing marketing site). Light theme first.
- Before any UI work: `frontend-design` skill → one anchor → tokens locked in `docs/DESIGN.md`. Hold the anchor through palette, typography, structure and texture.
- Component sourcing: UI/UX Pro Max for exploration, 21st.dev Magic MCP for production components, always re-skinned to the tokens.
- Performance budgets (Brief §11.4): Lighthouse ≥ 90 on touched pages, real product images via `next/image`, skeletons not spinners.

---

## 8. Workflow & Delivery Conventions

- **After each completed task:** commit and push to the feature branch automatically (never `main`).
- **Deploy:** after merge, run `vercel --prod --yes` (owner's convention; token in `.env.local`). Pushes alone only create Preview deployments.
- **Migrations:** `npx supabase db push` against the shop project only.
- **Phase exit** (Brief §16): typecheck, lint, unit + e2e green; migrations applied; deployed; `docs/*` updated; no secrets in git; RLS verified; Lighthouse budgets met; short report at `docs/reports/P{n}.md` (what shipped, what's mocked/pending, open decisions touched, next phase).
- **Blocked by an owner decision** → implement the Brief §15 default behind a flag and continue.
- **Blocked by the ERP** → use `scripts/mock-erp/` and continue.
- **Docs you own and must keep current:** `README.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_CONTRACT.md`, `docs/ERP_INTEGRATION.md`, `docs/DESIGN.md`, `docs/LEGAL_CHECKLIST.md`, `docs/RUNBOOK.md`, `CONTENT_TODO.md`.

---

## 9. Token Discipline

- Never read `node_modules`, `.next`, `dist`, `build`, `out`, `coverage`, lockfiles, `*.min.js`, `*.map`, `*.tsbuildinfo`, `.git/**`, `supabase/.branches`, `supabase/.temp`.
- Use `Glob` and `Grep` instead of `Read` when the goal is "find", not "study".
- Use `Read` with `offset/limit` for large files.
- Use `Agent` with `subagent_type: "Explore"` for broad searches (> 3 queries / > 3 directories).
- Don't re-read a file you just wrote.

---

## 10. Definition of Done for a Turn

1. Stayed within the requested scope and the current phase. No bonus refactors.
2. No ERP code/DB/credentials touched; no secrets in client code or logs.
3. RLS in place for every new tenant-facing table; pricing computed server-side only.
4. Typecheck + lint + relevant tests green.
5. Committed and pushed to the feature branch; follow-ups and risks listed explicitly.

If you cannot tick all five, the task is **not** done — say so.

---

## 11. When in Doubt

Ask one clarifying question rather than tearing out a wrong implementation later — **but** only when different readings lead to materially different work. Everything already decided in Brief §15 is not a question; build the default and flag it.
