# ROLE_GUIDE.md — What each role can do, and how

Living document. **Update it in the same change whenever a role, module or workflow changes.**
Source of truth for permissions is [types/roles.ts](../types/roles.ts); this file explains it in plain terms.
Menu and button names are the Turkish labels shown in the app.

Last reviewed: 2026-09-29.

---

## 1. Roles at a glance

| Role (badge) | Who | Sees | Can change |
|---|---|---|---|
| Platform admin | Gökhan (owner) | `/superadmin` only: companies, packages, users, audit | Companies, packages, seats. **Not** any company's stock, production or costs |
| `company_admin` (FIRMA ADMINI) | Company owner / manager | Everything in the company | Everything, plus users and marketplace credentials |
| `production_manager` (URETIM) | Production head | Everything | Master data, production, stock, shipments, orders, boardroom |
| `quality_manager` (KALITE) | QC | Everything | Quality checks and file attachments only |
| `operator` (OPERATOR) | Depot clerk | Finished goods only (see 3.1) | Stock scan/receipt, shipments, orders, marketplace |
| `company_user` (KULLANICI) | General staff | Everything | Same as production manager, plus quality |
| `viewer` (OKUMA) | Read-only | Everything | Nothing |
| `regional_manager` (BOLGE) | Sales rep | Dashboard, orders, products, stock, production (read), customers, sales | Enters pharmacy orders |
| Pharmacy buyer | External pharmacy | `/portal` only (not the ERP) | Own orders |

Write groups (from `types/roles.ts`):

| Group | company_admin | production_manager | quality_manager | operator | company_user | regional_manager |
|---|---|---|---|---|---|---|
| Master data (materials, products, recipes, suppliers) | yes | yes | – | – | yes | – |
| Production (orders, batches) | yes | yes | – | yes | yes | – |
| Quality | yes | – | yes | – | yes | – |
| Stock (lots, receipts, scan) | yes | yes | – | yes | yes | – |
| Files (CoA, attachments) | yes | yes | yes | – | yes | – |
| Shipments | yes | yes | – | yes | yes | – |
| B2B sales orders | yes | yes | – | yes | yes | yes |
| Marketplace (listings, price approval) | yes | yes | – | yes | yes | – |
| Boardroom (AI agents) | yes | yes | – | – | yes | – |
| Users, marketplace credentials | yes | – | – | – | – | – |

`viewer` appears in no write group.

---

## 2. Company structure in the menu

- **İmalat A.Ş.** (factory): Hammaddeler, Ambalaj, Yarı Mamüller, Lotlar, Stok Girişi (Barkod), Stok, Depo Hareketleri, Reçeteler, Üretim, Kalite Kontrol, Üretim İş Listesi, Tedarikçiler, MRP, Satınalma Siparişleri, Fatura / İrsaliye, Genel Giderler.
- **Satış Ltd. Şti.** (sales): Ürünler, Müşteriler, Satış & Ürünler, Eczane Siparişleri, Portal Kataloğu, Siparişler (shipments), Eczane Hesapları, Pazaryeri, Web Sitesi.
- **Ortak**: Ajan Kurulu, Cari Hesaplar, Raporlar, Kullanıcılar, Ayarlar.

Both entities are **one tenant**. Depots are locations: `ANA` = Ana Depo (factory), `LTD` = NeuPharma LTD.ŞTİ. (sales depot).

---

## 3. Role by role

### 3.1 Operator (depo personeli) — finished goods only

Menu: Panel, Stok, Depo Hareketleri, Siparişler (shipments), Eczane Siparişleri, Satış & Ürünler, Ürünler (read-only), Pazaryeri, Stok Girişi (Barkod).
Never sees raw materials, factory lots, recipes, production, costs, suppliers.

**Receive a batch into the LTD depot (counted)**
1. Open the QR on the batch card with the phone camera, or go to *Depo Hareketleri → Barkod Tara → Kamerayla Tara* (or type the lot number and press *Bul*).
2. Count the boxes and type the number in *Sayılan miktar*.
3. Press *NeuPharma LTD.ŞTİ.* (or one of its shelves).
4. If the count equals the system quantity the lot is received at once.
5. If it differs, a yellow box shows the difference. Type the reason, press *"… olarak stoğa al"*. The counted quantity becomes the stock; the difference is posted as an adjustment.
6. The lot stays in **quarantine** until someone releases it (see 3.2).

**Put a lot on a shelf inside the same depot**: scan the lot, then scan the shelf label (or pick it). No count needed.

**Scan a shelf**: lists the lots on it.

**Prepare and ship an order**: *Eczane Siparişleri* → open the order → convert to shipment; or *Siparişler → Yeni*. Pick released lots, then ship. Shipped shipments are immutable.

**Marketplace**: approve or reject price proposals, push stock, match listings.

**Stok Girişi (Barkod)**: enter existing finished stock by scanning the product barcode.

### 3.2 Company admin / production manager / company user

- **Master data**: Hammaddeler, Ambalaj, Yarı Mamüller, Ürünler (*Yeni Ürün*), Tedarikçiler, Müşteriler.
- **Recipes**: *Reçeteler → Yeni*. Hard rule: a YM recipe holds raw material only; a finished-product recipe holds YM plus packaging only. Publish before use.
- **Production**:
  1. *Üretim → Yeni Üretim Emri*: pick a published recipe and the target quantity. For finished products the quantity is in **boxes**.
  2. *Planla* → *Üretime Al* (batch number is suggested from the YM batch when there is exactly one in stock; batch numbers are unique per product).
  3. *Tamamla*: choose the consumed lots per item, output lot number, expiry date, location. The output lot is created in quarantine.
  4. *Parti Kartı (PDF)* on the completed order: A4 sheet with image, batch/lot number, contents and a QR. Save as PDF from the print dialog.
  5. Orders can be edited until completed; unstarted or mis-entered orders can be deleted (logged in *Silme Protokolü*).
- **Stock**: *Lotlar* (list, edit, delete mis-entered lots, *Etiket Yazdır (QR)*), *Mal Kabul*, *Stok Hareketi*, *Stok Değerleme* (bulk unit cost for costless lots), storno of a movement.
- **Release from quarantine**: open the lot in *Lotlar* and change its status to *Serbest* (after QC where required). Only released lots count as sellable.
- **Purchasing**: *MRP* computes needs from open orders; *Satınalma Siparişleri* sends to suppliers and records goods receipt; *Fatura / İrsaliye*.
- **Finance**: *Genel Giderler* (monthly), *Cari Hesaplar* (customer/supplier ledger, payments need receipt no, date, amount), *Raporlar* (costs, profitability, material costs).
- **Sales**: *Eczane Siparişleri*, *Portal Kataloğu* (what pharmacies see), *Eczane Hesapları* (buyer logins), *Web Sitesi*.
- **Boardroom**: *Ajan Kurulu* runs the AI debate; proposed actions are applied only after approval.

Company admin only: *Kullanıcılar* (invite users, set roles), *Ayarlar → Pazaryeri Bağlantıları* (API credentials), depots and shelves under *Ayarlar*.

### 3.3 Quality manager

Sees all modules. Writes: *Kalite Kontrol* (create checks, sign off or cancel) and file attachments (CoA, MSDS, reports). A failing QC blocks the lot or batch from release. No stock, production or master-data edits.

### 3.4 Viewer

Sees every module, changes nothing.

### 3.5 Regional manager

Sees Panel, Eczane Siparişleri, Ürünler, Stok, Üretim (read-only), Satış & Ürünler, Müşteriler. Enters orders on behalf of pharmacies. No master data, quality or users.

### 3.6 Pharmacy buyer (portal)

Separate from the ERP: not a company user. Signs in to `/portal`, browses the catalog the company published, places orders. Cannot open `/c/...`.

### 3.7 Platform admin

`/superadmin`: create companies, packages and seat limits, invite users, read the audit log. Does not touch any company's operational data.

---

## 4. End-to-end flow (factory → depot → customer)

1. Raw material arrives (*Mal Kabul* or a purchase order receipt) → lot in quarantine → QC → release.
2. YM order → complete → YM lot (batch number e.g. `2608006`).
3. Finished-product order using the same batch number → complete → finished lot in quarantine at `ANA`.
4. Print *Parti Kartı (PDF)*, attach it to the goods.
5. Depot clerk scans the QR, counts, takes the lot into `LTD`.
6. Lot released (quality decision) → appears as sellable stock, marketplace stock, portal availability.
7. Order arrives (portal, marketplace, manual) → shipment → ship.

---

## 5. Maintenance rules

- Changing `types/roles.ts` or a page guard ⇒ update section 1 and the affected section 3 in the same commit.
- New menu item or workflow ⇒ add it to section 2/3 with the exact button names.
- Open questions to settle with the owner are listed here until decided:
  - Should a lot be released automatically when the depot receives it, or stay a quality decision?
  - On a count difference, should the receipt wait for manager approval?
