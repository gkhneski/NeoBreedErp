import { requireModuleAccess } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

const tl = (n: number) =>
  `${Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ₺`;
const num = (n: number) => Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 3 });

const TYPE_LABEL: Record<string, string> = {
  raw: "Hammadde",
  semi: "Yarımamül",
  finished: "Bitmiş",
};

export default async function MaterialCostsReportPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireModuleAccess(routeCompanyId, "reports");
  const supabase = await createServerSupabaseClient();

  // Weighted-average purchase cost from receipt movements (with a unit cost).
  const { data: moves } = await supabase
    .from("stock_movements")
    .select("material_id, quantity, unit_cost")
    .eq("company_id", companyId)
    .eq("kind", "receipt")
    .not("unit_cost", "is", null)
    .returns<Array<{ material_id: string; quantity: number; unit_cost: number | null }>>();

  const agg = new Map<string, { qty: number; cost: number }>();
  for (const m of moves ?? []) {
    if (m.unit_cost === null) continue;
    const a = agg.get(m.material_id) ?? { qty: 0, cost: 0 };
    a.qty += Number(m.quantity);
    a.cost += Number(m.quantity) * Number(m.unit_cost);
    agg.set(m.material_id, a);
  }

  const ids = [...agg.keys()];
  const metaById = new Map<string, { code: string; name: string; type: string; base_uom: string }>();
  if (ids.length > 0) {
    const { data: mats } = await supabase
      .from("materials")
      .select("id, code, name, type, base_uom")
      .eq("company_id", companyId)
      .in("id", ids)
      .returns<Array<{ id: string; code: string; name: string; type: string; base_uom: string }>>();
    for (const m of mats ?? []) metaById.set(m.id, m);
  }

  const rows = ids
    .map((id) => {
      const a = agg.get(id)!;
      return {
        id,
        meta: metaById.get(id),
        qty: a.qty,
        avg: a.qty > 0 ? a.cost / a.qty : 0,
      };
    })
    .filter((r) => r.meta)
    .sort((a, b) => (a.meta!.code < b.meta!.code ? -1 : 1));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Hammadde / Ambalaj Ortalama Maliyet
        </h1>
        <p className="text-sm text-muted-foreground">
          Tüm alış girişlerinden ağırlıklı ortalama birim maliyet (Σ miktar×maliyet ÷ Σ miktar).
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Maliyetli alış kaydı yok. Mal kabulde birim maliyet girilince burada görünür.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Kod</th>
                <th className="px-3 py-2 text-left">Malzeme</th>
                <th className="px-3 py-2 text-left">Tip</th>
                <th className="px-3 py-2 text-right">Toplam Alınan</th>
                <th className="px-3 py-2 text-right">Ort. Birim Maliyet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono">{r.meta!.code}</td>
                  <td className="px-3 py-2">{r.meta!.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {TYPE_LABEL[r.meta!.type] ?? r.meta!.type}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {num(r.qty)} {r.meta!.base_uom}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {tl(r.avg)} / {r.meta!.base_uom}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
