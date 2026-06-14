// Removes the marketplace DEMO data created for the Trendyol walkthrough.
// Usage: node scripts/demo-marketplace-teardown.mjs
//
// stock_movements is an append-only ledger (delete is blocked by trigger), so
// the demo material + lot are SOFT-deleted (deleted_at) — they vanish from every
// UI list. The listing and its pending price events are hard-deleted.
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const BASE = env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1";
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", Prefer: "return=representation" };

async function rest(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> HTTP ${r.status} ${t}`);
  return t ? JSON.parse(t) : [];
}

const CODE = "DEMO-TY-01";
const BARCODE = "DEMO-TY-BARCODE-DELETEME";

const mats = await rest("GET", `/materials?select=id&code=eq.${CODE}`);
const matId = mats[0]?.id;

const listings = await rest("GET", `/marketplace_listings?select=id&barcode=eq.${BARCODE}`);
for (const l of listings) {
  await rest("DELETE", `/marketplace_price_events?listing_id=eq.${l.id}`);
  await rest("DELETE", `/marketplace_listings?id=eq.${l.id}`);
}

if (matId) {
  const now = new Date().toISOString();
  await rest("PATCH", `/material_lots?material_id=eq.${matId}`, { deleted_at: now });
  await rest("PATCH", `/materials?id=eq.${matId}`, { deleted_at: now });
}

console.log("DEMO data removed (material/lot soft-deleted, listing/events hard-deleted).");
