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

type SemiRow = {
  id: string;
  code: string;
  name: string;
  base_uom: string;
  material_lots:
    | Array<{ quantity_on_hand: number; status: string; deleted_at: string | null }>
    | null;
};

function formatQuantity(value: number): string {
  return Number(value).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

export default async function SemiFinishedPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  // Same permission surface as raw materials — YM is factory master data.
  const { companyId, role } = await requireModuleAccess(routeCompanyId, "materials");
  const supabase = await createServerSupabaseClient();

  const { data: rows } = await supabase
    .from("materials")
    .select(
      "id, code, name, base_uom, material_lots(quantity_on_hand, status, deleted_at)",
    )
    .eq("company_id", companyId)
    .eq("type", "semi")
    .is("deleted_at", null)
    .order("code", { ascending: true })
    .returns<SemiRow[]>();

  const newHref = `${companyModulePath(
    companyId,
    "materials",
    "new",
  )}?type=semi&returnTo=${encodeURIComponent(
    companyModulePath(companyId, "semi-finished"),
  )}`;
  const canWrite = canWriteCompanyData(role, MASTER_DATA_WRITE_ROLES);
  const semiRows = rows ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Yarı Mamüller</h1>
          <p className="text-sm text-muted-foreground">
            Hammaddelerden üretilen ara ürünler (YM). Kendi reçetesiyle (yalnızca
            hammadde) üretilir, sonra mamül reçetesinde ambalajla birleştirilir.
          </p>
        </div>
        {canWrite ? (
          <Link href={newHref}>
            <Button>Yeni Yarı Mamül</Button>
          </Link>
        ) : null}
      </header>

      {semiRows.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Kod</th>
                <th className="px-3 py-2 text-left font-medium">Ad</th>
                <th className="px-3 py-2 text-right font-medium">Serbest Stok</th>
                <th className="px-3 py-2 text-right font-medium">Karantina</th>
                <th className="px-3 py-2 text-left font-medium">Birim</th>
              </tr>
            </thead>
            <tbody>
              {semiRows.map((row) => {
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Henüz yarı mamül yok"
          description="Yarı mamül (YM) kayıtları burada tutulur; reçetesi yalnızca hammaddeden oluşur ve mamül reçetesinde çıktı olarak kullanılır."
          action={
            canWrite ? (
              <Link href={newHref}>
                <Button>Yarı Mamül Ekle</Button>
              </Link>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
