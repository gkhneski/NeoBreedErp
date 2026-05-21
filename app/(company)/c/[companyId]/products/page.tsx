import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type ProductRow = {
  id: string;
  code: string;
  name: string;
  base_uom: string;
  storage_conditions: string | null;
  regulatory_notes: string | null;
  material_lots: Array<{
    quantity_on_hand: number;
    status: "quarantine" | "released" | "blocked";
  }> | null;
};

function formatNumber(n: number): string {
  return Number(n).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

export default async function ProductsPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const { data: products } = await supabase
    .from("materials")
    .select(
      "id, code, name, base_uom, storage_conditions, regulatory_notes, material_lots(quantity_on_hand, status)",
    )
    .eq("company_id", companyId)
    .eq("type", "finished")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .returns<ProductRow[]>();

  const rows = products ?? [];
  const newHref = companyModulePath(companyId, "materials", "new");

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Ürünler</h1>
          <p className="text-sm text-muted-foreground">
            Bitmiş ürün kartları ve lotlardan gelen stok özeti.
          </p>
        </div>
        <Link href={newHref}>
          <Button>Yeni Ürün</Button>
        </Link>
      </header>

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Kod</th>
                <th className="px-3 py-2 text-left font-medium">Ad</th>
                <th className="px-3 py-2 text-right font-medium">Serbest Stok</th>
                <th className="px-3 py-2 text-right font-medium">Karantina</th>
                <th className="px-3 py-2 text-left font-medium">Saklama</th>
                <th className="px-3 py-2 text-left font-medium">Regülasyon</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const lots = row.material_lots ?? [];
                const released = lots
                  .filter((lot) => lot.status === "released")
                  .reduce((sum, lot) => sum + Number(lot.quantity_on_hand), 0);
                const quarantine = lots
                  .filter((lot) => lot.status === "quarantine")
                  .reduce((sum, lot) => sum + Number(lot.quantity_on_hand), 0);
                return (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link
                        href={companyModulePath(companyId, "materials", row.id)}
                        className="hover:underline"
                      >
                        {row.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {formatNumber(released)}{" "}
                      <span className="text-muted-foreground">
                        {row.base_uom}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {quarantine > 0 ? (
                        <Badge variant="warning">
                          {formatNumber(quarantine)} {row.base_uom}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {row.storage_conditions ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {row.regulatory_notes ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Henüz bitmiş ürün yok"
          description="Malzemeler ekranından tipi bitmiş ürün olan bir kayıt açın."
          action={
            <Link href={newHref}>
              <Button>Ürün Ekle</Button>
            </Link>
          }
        />
      )}
    </div>
  );
}
