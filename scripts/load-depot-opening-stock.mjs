// One-time opening-stock load for the LTD depot (NeuPharma LTD.ŞTİ.).
// Idempotent: skips a product/lot that already exists, so re-running never
// double-counts. Finished goods only; lots placed at the depot location.
//   Released = sellable; Blocked = samples / expired (counted, not sellable).
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const BASE = env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1";
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", Prefer: "return=representation" };

const CO = "4f73f01a-5467-4a2a-8616-b8c17f274ba5";
const DEPOT = "8bf8c994-764f-4a7e-bad5-676cf94fdf2b"; // NeuPharma LTD.ŞTİ.
const RECEIVED = "2026-06-15";

async function rest(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${t}`);
  return t ? JSON.parse(t) : [];
}

function skt(s) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})\/(\d{4})$/);
  if (!m) throw new Error("bad SKT " + s);
  const month = Number(m[1]), year = Number(m[2]);
  const last = new Date(year, month, 0).getDate();
  return `${year}-${m[1]}-${String(last).padStart(2, "0")}`;
}

const PRODUCTS = [
  { name: "B12 TABLET", lots: [{ n: "2603011", skt: "03/2029", q: 2017 }] },
  { name: "B12 SPREY", lots: [{ n: "25020012", skt: "02/2028", q: 1992 }] },
  { name: "MİCROBON K", lots: [{ n: "2601074", skt: "01/2029", q: 2185 }] },
  { name: "DİO30", existingCode: "URN-01", lots: [{ n: "2601054", skt: "01/2029", q: 1749 }] },
  { name: "DİO60", lots: [{ n: "2606001", skt: "06/2029", q: 11070 }] },
  { name: "DİOFOL90", lots: [{ n: "251218", skt: "12/2028", q: 338 }, { n: "2606001", skt: "06/2029", q: 2000 }] },
  { name: "İNNATE", lots: [{ n: "5150", skt: "11/2028", q: 396 }] },
  { name: "PROMENK", lots: [{ n: "2601008", skt: "01/2028", q: 197 }] },
  { name: "PROWOMEN", lots: [{ n: "2601009", skt: "01/2028", q: 2938 }, { n: "2601009-N", skt: "01/2028", q: 627, status: "blocked", note: "NUMUNE" }] },
  { name: "STONCARE KAPSÜL", lots: [{ n: "5122", skt: "09/2028", q: 471 }] },
  { name: "SAWRİVER", lots: [{ n: "SWR2601", skt: "06/2028", q: 2739 }] },
  { name: "PRİMROYA", lots: [{ n: "PRM2604", skt: "09/2028", q: 7845 }] },
  { name: "MİNİCTUSS", lots: [{ n: "2602002", skt: "02/2028", q: 3 }] },
  { name: "NEUJOYS JEL", lots: [{ n: "640", skt: "10/2028", q: 6324 }] },
  { name: "ALPHA LİODİC ACİD", lots: [] },
  { name: "MAGNESIUM CİTRATE", lots: [{ n: "2512008", skt: "12/2028", q: 2950 }] },
  { name: "D3K2", lots: [] },
  { name: "MAGNESIUM BİSGLYCINATE", lots: [{ n: "24070012", skt: "07/2027", q: 300 }] },
  { name: "LAYLA", lots: [] },
  { name: "LACTASE", lots: [{ n: "26010020", skt: "01/2028", q: 851 }] },
  { name: "PUF- FER", lots: [{ n: "2603004", skt: "11/2027", q: 1 }] },
  { name: "BROMELIAN", lots: [{ n: "2602002", skt: "02/2028", q: 63 }] },
  { name: "BREWER'S YEAST", lots: [{ n: "2409004", skt: "09/2026", q: 89 }] },
  { name: "MAGNESIUM MALATE", lots: [{ n: "24070013", skt: "07/2027", q: 826 }] },
  { name: "GYNO-FEM", lots: [{ n: "24030378", skt: "02/2026", q: 335, status: "blocked", note: "NUMUNE + SKT geçmiş" }] },
  { name: "DİOFOL S", lots: [{ n: "2606007", skt: "06/2029", q: 4470 }] },
  { name: "FERROUS BISGLISNAT", lots: [{ n: "2503017", skt: "03/2027", q: 331 }] },
  { name: "DOUBLE SPİN PURE PRP", lots: [{ n: "20240001", skt: "2025-11-14", q: 349, status: "blocked", note: "SKT geçmiş" }] },
];

const enc = encodeURIComponent;

async function main() {
  // Next URN code number.
  const existing = await rest("GET", `/materials?select=code&company_id=eq.${CO}&code=like.URN-*`);
  let next = existing.reduce((m, r) => { const mm = /^URN-(\d+)$/i.exec(r.code); return mm ? Math.max(m, Number(mm[1])) : m; }, 0);

  let createdProducts = 0, reusedProducts = 0, createdLots = 0, skippedLots = 0;
  let totalReleased = 0, totalBlocked = 0;

  for (const p of PRODUCTS) {
    // Resolve material id (reuse by code or name; else create).
    let matId, matCode;
    if (p.existingCode) {
      const rows = await rest("GET", `/materials?select=id,code&company_id=eq.${CO}&code=eq.${enc(p.existingCode)}`);
      if (!rows[0]) throw new Error("existingCode not found: " + p.existingCode);
      matId = rows[0].id; matCode = rows[0].code; reusedProducts++;
    } else {
      const found = await rest("GET", `/materials?select=id,code&company_id=eq.${CO}&type=eq.finished&deleted_at=is.null&name=eq.${enc(p.name)}`);
      if (found[0]) { matId = found[0].id; matCode = found[0].code; reusedProducts++; }
      else {
        next += 1; matCode = `URN-${String(next).padStart(2, "0")}`;
        const ins = await rest("POST", "/materials", { company_id: CO, code: matCode, name: p.name, type: "finished", base_uom: "adet" });
        matId = ins[0].id; createdProducts++;
      }
    }

    for (const lot of p.lots) {
      const status = lot.status || "released";
      // Skip if this lot number already exists for the material.
      const ex = await rest("GET", `/material_lots?select=id&company_id=eq.${CO}&material_id=eq.${matId}&lot_number=eq.${enc(lot.n)}&deleted_at=is.null`);
      if (ex[0]) { skippedLots++; continue; }

      const lotRow = await rest("POST", "/material_lots", {
        company_id: CO, material_id: matId, lot_number: lot.n,
        received_at: RECEIVED, expiry_date: skt(lot.skt), status, location_id: DEPOT,
      });
      await rest("POST", "/stock_movements", {
        company_id: CO, material_id: matId, lot_id: lotRow[0].id, kind: "receipt",
        quantity: lot.q, occurred_at: RECEIVED + "T00:00:00Z",
        notes: "Açılış stoğu (LTD)" + (lot.note ? " - " + lot.note : ""),
      });
      createdLots++;
      if (status === "blocked") totalBlocked += lot.q; else totalReleased += lot.q;
      console.log(`  + ${matCode} ${p.name.padEnd(24)} lot ${lot.n.padEnd(12)} ${String(lot.q).padStart(6)} ${status}`);
    }
  }

  console.log(`\nÜrün: ${createdProducts} yeni, ${reusedProducts} mevcut. Lot: ${createdLots} eklendi, ${skippedLots} atlandı (zaten vardı).`);
  console.log(`Toplam serbest (released): ${totalReleased.toLocaleString("tr-TR")} adet`);
  console.log(`Toplam bloke (numune/SKT): ${totalBlocked.toLocaleString("tr-TR")} adet`);
  console.log(`GENEL TOPLAM: ${(totalReleased + totalBlocked).toLocaleString("tr-TR")} adet`);
}

main().catch((e) => { console.error("HATA:", e.message); process.exit(1); });
