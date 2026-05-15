# DESIGN_DIRECTION.md

Visual and UX direction for NeoBreed-ERP. The goal: a calm, precise, clinical look that signals "regulated manufacturing software" — not a flashy consumer SaaS.

This document binds visual decisions across the platform. Deviations require user approval.

---

## 1. Brand Tone

- **Calm, precise, trustworthy.** This is a tool for regulated production work.
- **Density over whitespace** in operational screens (lots of rows, narrow chrome). Marketing pages can breathe more.
- **No playful illustrations** of pills, beakers, mortars. We use real data, real numbers, real lot codes.
- **No emojis in product UI.**

---

## 2. Palette (initial direction — refine in Phase 1)

Use HSL/oklch via Tailwind's CSS variables (shadcn convention).

**Light mode (default):**
- Background: near-white (`hsl(210 20% 98%)`)
- Surface: pure white
- Foreground: dark slate (`hsl(222 24% 14%)`)
- Primary: a calm clinical blue-green (`hsl(178 55% 32%)`) — evokes precision lab, not corporate Facebook blue.
- Accent: a desaturated amber for "attention" states (`hsl(35 70% 50%)`).
- Destructive: a restrained red (`hsl(0 65% 45%)`) — not neon.
- Muted text: `hsl(220 10% 45%)`.
- Border: `hsl(220 14% 90%)`.

**Dark mode:**
- Background: `hsl(222 22% 9%)`
- Surface: `hsl(222 20% 12%)`
- Foreground: `hsl(210 15% 92%)`
- Primary brightens to ~`hsl(178 55% 50%)`.

These are starting values. The Phase 1 tailwind config locks them in.

---

## 3. Typography

- **Sans:** Inter (variable). Body, UI, tables.
- **Mono:** JetBrains Mono or Geist Mono. Lot codes, batch IDs, SKU, formula identifiers.
- **Display:** Inter at heavier weights for marketing-only pages. No second display font.

Scale (tailwind defaults, with these in regular use):
- `text-xs` for table meta and timestamps.
- `text-sm` for body in dense tables.
- `text-base` for forms.
- `text-lg` / `text-xl` for section titles inside a page.
- Page titles: `text-2xl font-semibold tracking-tight`.

---

## 4. Structure

- **App shell:** left sidebar (navigation) + top bar (active company switcher, user menu, search).
- **Company switcher** sits in the top bar with the active company name visible at all times. The user must never wonder which tenant they are in.
- **Super Admin** uses a **distinct shell** with a different accent strip (e.g., a subtle top border in the destructive color) so it is unmistakable that you are in platform mode, not company mode.
- **Tables are first-class.** Sticky header, sticky first column when wide, keyboard-navigable rows.
- **Forms** use shadcn `Form` with `react-hook-form` + `zod` (when introduced).

---

## 5. On-Screen Strings

- **All user-facing UI must be Turkish.** Code identifiers, file/route names, and technical docs stay in English; only visible strings shown to users are translated.
- Use **real domain terms**: "Lot No", "Üretim Emri" (or "Production Order"), "Hammadde", "Bitmiş Ürün", "Kalite Kontrol".
- Never use placeholder filler like "Lorem ipsum", "John Doe", "test@test.com" in any shipped surface.
- Empty states must name the missing thing: "No production orders yet for this company" — not "Nothing here yet."
- Currency: show the company's configured currency code next to the number (e.g., `1.250,00 TRY`). Use locale-aware formatting.

---

## 6. Iconography

- **lucide-react** (already aligned with shadcn).
- Outline icons only; do not mix outline and solid sets.
- Icons accompany text, they don't replace it in navigation.

---

## 7. Density & Layout

- Operational screens target ~12–16 rows per viewport on a 14" laptop.
- Padding scale uses Tailwind `p-2` / `p-3` / `p-4` predominantly; avoid `p-8` for app surfaces (reserved for marketing).
- Cards have a subtle border (`border`) rather than a shadow. Shadows are used for elevation in dropdowns and dialogs.

---

## 8. Motion

- Subtle. 150–200ms ease-out for hover/focus/dialog open.
- No animated logos, no parallax, no page-load shimmer aesthetics in the app.
- Tables and lists do **not** animate row entry.

---

## 9. Accessibility

- Color is never the sole signal (always pair with text or icon).
- Focus rings are visible — do not remove default focus outlines without a deliberate replacement.
- Keyboard: every action available via mouse must also be reachable by keyboard.
- Targets ≥ 32×32 px in dense tables, ≥ 40×40 px elsewhere.

---

## 10. What This Project Does Not Look Like

- Not Notion. Not Linear (we admire it but won't imitate it).
- Not a banking app — too cold.
- Not a consumer health app — too playful.
- Closest reference frames: **clinical LIMS software**, **modern manufacturing dashboards**, **regulatory compliance tools** — but cleaner.
