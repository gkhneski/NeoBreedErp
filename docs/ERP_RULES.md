# ERP_RULES.md

Domain rules for the ERP modules. These rules apply **per company** — every entity below carries `company_id` and is isolated by it.

Scope at MVP: recipes, materials & stock with lot/batch, production orders & batches, quality control, basic costing, per-company file storage. Anything else is out of scope until said otherwise.

---

## 1. Units of Measure (UoM)

- Each material declares a **base UoM** (e.g., `g`, `kg`, `mg`, `mL`, `L`, `unit`).
- Recipes and stock movements may use alternative UoMs but must declare a conversion factor to the base UoM on the material itself.
- All internal math is in the base UoM. UI may display alternatives.
- No mixing of mass and volume without an explicit density on the material.

---

## 2. Recipes / Formulations

- A **recipe** belongs to a finished good (`material` of type `finished`) and lists raw materials (`recipe_items`) with quantities and percentages.
- A recipe has a **version**. Editing a published recipe creates a new version; old versions remain referenced by historical production batches.
- A recipe item may be marked **active** (used in costing/MRP) or **inactive** (substitution allowed).
- A recipe must total to a defined yield (e.g., 1.000 kg of finished good). Percentages must sum to 100% when expressed in percentage mode.
- Sensitive recipe data is per-company; Super Admin cannot read it (see `SUPERADMIN_RULES.md`).

---

## 3. Materials

Two top-level kinds:
- `raw` — purchased inputs (active ingredients, excipients, capsules, bottles, labels…).
- `finished` — produced outputs (the company's products).
- (Future) `semi` — intermediates produced in-house and consumed by another recipe.

Each material has: code (per company), name, type, base UoM, default supplier (optional), allergen flags, storage conditions, regulatory notes.

Material codes are **unique per company**, not globally.

---

## 4. Stock with Lot / Batch Tracking

- Stock is tracked at **(material, lot)** level. A lot has: lot number, supplier, received date, expiry date, quantity on hand, CoA file reference.
- All stock changes happen through `stock_movements`:
  - `receipt` — goods received against a purchase or production output.
  - `issue` — consumed by a production order or written off.
  - `adjustment` — physical count correction, with reason.
  - `transfer` — between locations (Phase 7b): a zero-quantity ledger row carrying from/to location; the lot's `location_id` moves with it. Only `released` lots with stock on hand may transfer, and only as a whole lot.
- Quantity on hand is always derived from `stock_movements`, never edited directly.
- Lots cannot go negative. If a stock movement would make a lot negative, the operation fails.
- Expired lots are flagged but not auto-issued; a human decides.

---

## 5. Production Orders & Batches

- A **production order** is an instruction to produce N units of a finished good using a specific recipe version.
- A production order has states: `draft → planned → in_progress → completed → closed | cancelled`.
- When started, the system creates a **production batch** (or one batch per execution if split) with:
  - Planned vs actual quantity per recipe item.
  - Lots consumed (linked to `stock_movements` of type `issue`).
  - Output quantity and assigned lot of finished good (linked to `stock_movements` of type `receipt`).
- Once `completed`, the batch is immutable except for QC linkage and post-completion costing snapshot.

---

## 6. Quality Control (QC)

- QC records attach to either a **raw material lot** (incoming inspection) or a **production batch** (in-process / final inspection).
- A QC record has: checklist (specs), measured values, pass/fail per item, overall verdict, signer (`user_id`), signed_at.
- Failing QC blocks the lot/batch from being marked as **released** for further consumption or shipment.
- QC sign-off is a deliberate action — separate from save — and is recorded in the per-company audit log.

---

## 7. Costing (Basic, MVP)

- Cost is computed **per production batch** as the sum of (issued quantity × lot unit cost) over all consumed lots.
- Lot unit cost is set at receipt (purchase price ÷ received quantity, in the company's currency).
- Currency is the company's currency; no FX in MVP.
- Cost snapshots are stored on the batch so historical costs are stable even if material prices change later.
- No labor or overhead in MVP (explicit).
- **Customer-owned lots (müşteri malı, Phase 7a):** lots with `owner_customer_id` carry no acquisition cost for the factory. They are consumed normally but their `line_cost` is 0, they are excluded from `cost_total` and from currency inference, and their snapshot rows carry `customer_owned = true`. A mixed batch's cost therefore reflects factory-owned materials only.

### 7.1 Contract Manufacturing ("Fason", Phase 7a)

- Customers are operational records inside the factory's tenant — no portal, no login, never a separate tenant.
- A production order may carry `customer_id` ("produced on behalf of"). Empty means own production.
- Customer-supplied raw material is received as a normal lot flagged with `owner_customer_id`; it must not carry a unit cost.
- Output lots of fason batches are NOT marked customer-owned; delivery/ownership transfer is out of ERP scope (accounting is external).

---

## 8. Files (Supabase Storage)

- Per-company prefix: `<company_id>/`.
- Sub-prefixes by domain: `<company_id>/recipes/...`, `<company_id>/qc/...`, `<company_id>/batches/...`.
- Allowed file types per surface are validated server-side (e.g., PDF and image for CoAs).
- Object size limits enforced server-side; configurable per package.

---

## 9. Numbering & Codes

- Lot numbers, batch numbers, and production order numbers are per-company sequences. Format is configurable per company (prefix + zero-padded counter) but defaults are sensible (e.g., `LOT-000001`).
- Codes are never reused. Soft-deleted entities keep their codes reserved.

---

## 10. Concurrency

- Two users editing the same recipe → optimistic concurrency via `updated_at`. The second writer is asked to refresh.
- Stock movements on the same lot are serialized per lot (DB-level constraint + retry on conflict) so quantity-on-hand never goes negative due to a race.

---

## 11. Permissions Inside a Company

- `company_admin` — full company access, manages users and packages-related limits (within what their package allows).
- `production_manager` - manages materials, suppliers, recipes, lots, stock movements, production orders, and production batches. Reads QC but does not sign QC.
- `quality_manager` - manages QC records, QC results, QC sign-off, lot release/block decisions, and quality documents. Reads production and stock context.
- `operator` - performs shop-floor work such as lot receipt, stock issue/adjustment, and production execution. Cannot manage users, settings, recipes, or QC sign-off.
- `viewer` - read-only company access. Cannot create, update, sign, upload, or delete company operational data.
- `company_user` - legacy/demo broad operational role kept for existing memberships. New users should be assigned one of the explicit roles above.

---

## 12. Explicitly Out of Scope (do not implement)

- e-Fatura, e-İrsaliye, GİB integration.
- Full general ledger / double-entry accounting.
- Per-location partial lot quantities (Phase 7b implements locations with **whole-lot transfer only**: a lot lives at exactly one location; splitting a lot across locations stays out of scope).
- MRP / demand planning.
- Customer portals.
- Supplier portals.
- Native mobile apps.
