import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireModuleAccess } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  MASTER_DATA_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type PackagingRow = {
  id: string;
  code: string;
  name: string;
  base_uom: string;
  storage_conditions: string | null;
  material_lots:
    | Array<{
        quantity_on_hand: number;
        status: string;
        deleted_at: string | null;
      }>
    | null;
};

function formatQuantity(value: number): string {
  return Number(value).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

export default async function PackagingPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireModuleAccess(routeCompanyId, "packaging");
  const supabase = await createServerSupabaseClient();

  const { data: rows } = await supabase
    .from("materials")
    .select("id, code, name, base_uom, storage_conditions, material_lots(quantity_on_hand, status, deleted_at)")
    .eq("company_id", companyId)
    .eq("type", "raw")
    .is("deleted_at", null)
    .or("code.ilike.AMB-%,code.ilike.PKG-%")
    .order("code", { ascending: true })
    .returns<PackagingRow[]>();

  const newHref = `${companyModulePath(
    companyId,
    "materials",
    "new",
  )}?preset=packaging&returnTo=${encodeURIComponent(
    companyModulePath(companyId, "packaging"),
  )}`;
  const canWrite = canWriteCompanyData(role, MASTER_DATA_WRITE_ROLES);
  const packagingRows = rows ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Ambalaj Malzemeleri
          </h1>
          <p className="text-sm text-muted-foreground">
            Şişe, kapak, etiket, kutu gibi üretimde tüketilen ambalaj kalemleri.
          </p>
        </div>
        {canWrite ? (
          <Link href={newHref}>
            <Button>Yeni Ambalaj</Button>
          </Link>
        ) : null}
      </header>

      {packagingRows.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Kod</th>
                <th className="px-3 py-2 text-left font-medium">Ad</th>
                <th className="px-3 py-2 text-right font-medium">Serbest Stok</th>
                <th className="px-3 py-2 text-right font-medium">Karantina</th>
                <th className="px-3 py-2 text-left font-medium">Birim</th>
                <th className="px-3 py-2 text-left font-medium">Saklama</th>
              </tr>
            </thead>
            <tbody>
              {packagingRows.map((row) => {
                const lots = (row.material_lots ?? []).filter(
                  (lot) => lot.deleted_at === null,
                );
                const released = lots
                  .filter((lot) => lot.status === "released")
                  .reduce((sum, lot) => sum + Number(lot.quantity_on_hand), 0);
                const quarantine = lots
                  .filter((lot) => lot.status === "quarantine")
                  .reduce((sum, lot) => sum + Number(lot.quantity_on_hand), 0);
                const detailHref = companyModulePath(companyId, "materials", row.id);

                return (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link href={detailHref} className="hover:underline">
                        {row.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={detailHref} className="hover:underline">
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {formatQuantity(released)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                      {formatQuantity(quarantine)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{row.base_uom}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {row.storage_conditions ?? "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Henüz ambalaj malzemesi yok"
          description="Ambalaj kayıtları AMB- veya PKG- koduyla hammadde tipi altında tutulur ve ürün reçetesinde seçilebilir."
          action={
            canWrite ? (
              <Link href={newHref}>
                <Button>Ambalaj Ekle</Button>
              </Link>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
