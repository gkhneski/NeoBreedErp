import { Gift } from "lucide-react";
import Link from "next/link";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

type Row = {
  material_id: string;
  quantity_on_hand: number;
  materials: { code: string; name: string } | null;
};

// Dashboard: eldeki promosyon ürünleri (satılmaz, depoda sayılır).
export async function PromoStockCard({ companyId }: { companyId: string }) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("material_lots")
    .select("material_id, quantity_on_hand, materials:material_id!inner(code, name, type)")
    .eq("company_id", companyId)
    .eq("materials.type", "promo")
    .is("deleted_at", null)
    .gt("quantity_on_hand", 0)
    .returns<Row[]>();

  const byMaterial = new Map<string, { code: string; name: string; qty: number }>();
  for (const row of data ?? []) {
    const cur = byMaterial.get(row.material_id);
    if (cur) cur.qty += Number(row.quantity_on_hand);
    else
      byMaterial.set(row.material_id, {
        code: row.materials?.code ?? "",
        name: row.materials?.name ?? "—",
        qty: Number(row.quantity_on_hand),
      });
  }
  const items = Array.from(byMaterial.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "tr"),
  );
  const total = items.reduce((s, i) => s + i.qty, 0);
  const href = companyModulePath(companyId, "promo");

  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <Gift className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          Promosyon Ürünleri
        </h2>
        <Link href={href} className="text-xs text-muted-foreground hover:underline">
          {items.length > 0 ? `Toplam ${total.toLocaleString("tr-TR")} adet · Yönet` : "Yönet"}
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Henüz promosyon ürünü girilmedi. Numune, hediye ve broşürleri buradan takip edin.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border/60 text-sm">
          {items.slice(0, 8).map((i) => (
            <li key={i.code} className="flex items-center justify-between gap-3 py-1.5">
              <span className="truncate">
                <span className="font-mono text-xs text-muted-foreground">{i.code}</span>{" "}
                {i.name}
              </span>
              <span className="font-mono tabular-nums">{i.qty.toLocaleString("tr-TR")}</span>
            </li>
          ))}
          {items.length > 8 ? (
            <li className="pt-1.5 text-xs text-muted-foreground">
              <Link href={href} className="hover:underline">
                +{items.length - 8} ürün daha
              </Link>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}
