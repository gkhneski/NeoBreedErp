// Reverts the LTD opening-stock load (internal names caused a naming mismatch
// with factory output). stock_movements is append-only, so the new materials
// and their lots are SOFT-deleted (vanish from every screen). URN-01 pre-existed
// — only the lot added to it is removed, not the product card.
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const BASE = env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1";
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", Prefer: "return=representation" };
const CO = "4f73f01a-5467-4a2a-8616-b8c17f274ba5";
const NOW = new Date().toISOString();
const enc = encodeURIComponent;

async function rest(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${t}`);
  return t ? JSON.parse(t) : [];
}

// Products to fully remove (created by the loader).
const NAMES = [
  "B12 TABLET", "B12 SPREY", "MİCROBON K", "DİO60", "DİOFOL90", "İNNATE",
  "PROMENK", "PROWOMEN", "STONCARE KAPSÜL", "SAWRİVER", "PRİMROYA", "MİNİCTUSS",
  "NEUJOYS JEL", "ALPHA LİODİC ACİD", "MAGNESIUM CİTRATE", "D3K2",
  "MAGNESIUM BİSGLYCINATE", "LAYLA", "LACTASE", "PUF- FER", "BROMELIAN",
  "BREWER'S YEAST", "MAGNESIUM MALATE", "GYNO-FEM", "DİOFOL S",
  "FERROUS BISGLISNAT", "DOUBLE SPİN PURE PRP",
];

async function main() {
  let mats = 0, lots = 0;
  for (const name of NAMES) {
    const found = await rest("GET", `/materials?select=id,code&company_id=eq.${CO}&type=eq.finished&deleted_at=is.null&name=eq.${enc(name)}`);
    for (const m of found) {
      const ls = await rest("PATCH", `/material_lots?company_id=eq.${CO}&material_id=eq.${m.id}&deleted_at=is.null`, { deleted_at: NOW });
      lots += ls.length;
      await rest("PATCH", `/materials?id=eq.${m.id}`, { deleted_at: NOW });
      mats += 1;
      console.log(`  - ${m.code} ${name} (lot: ${ls.length})`);
    }
  }
  // DİO30 was attached to the pre-existing URN-01 — remove only that lot.
  const u1 = await rest("GET", `/materials?select=id&company_id=eq.${CO}&code=eq.URN-01`);
  if (u1[0]) {
    const ls = await rest("PATCH", `/material_lots?company_id=eq.${CO}&material_id=eq.${u1[0].id}&lot_number=eq.2601054&deleted_at=is.null`, { deleted_at: NOW });
    lots += ls.length;
    if (ls.length) console.log(`  - URN-01 lot 2601054 (DİO30) kaldırıldı`);
  }
  console.log(`\nSoft-deleted: ${mats} ürün kartı, ${lots} lot. (URN-01/DIOFOL 30 korundu.)`);
}

main().catch((e) => { console.error("HATA:", e.message); process.exit(1); });
