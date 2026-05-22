import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
import {
  SIGNED_URL_TTL_SECONDS,
  TENANT_FILES_BUCKET,
} from "@/lib/storage/attachments";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  MASTER_DATA_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

import { deleteMaterial } from "../materials/actions";
import Image from "next/image";

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
  const { companyId, role } = await requireCompanyUser(routeCompanyId);
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
  const newHref = companyModulePath(companyId, "products", "new");
  const canWrite = canWriteCompanyData(role, MASTER_DATA_WRITE_ROLES);
  const thumbnailPaths = rows.map((row) => `${companyId}/products/${row.id}/thumbnail`);
  const { data: signedThumbnails } =
    thumbnailPaths.length > 0
      ? await supabase.storage
          .from(TENANT_FILES_BUCKET)
          .createSignedUrls(thumbnailPaths, SIGNED_URL_TTL_SECONDS)
      : { data: [] };
  const thumbnailByPath = new Map<string, string>();
  for (const entry of signedThumbnails ?? []) {
    if (entry?.path && entry.signedUrl) {
      thumbnailByPath.set(entry.path, entry.signedUrl);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Urunler</h1>
          <p className="text-sm text-muted-foreground">
            Urun kodlari URN-01 formatinda otomatik verilir.
          </p>
        </div>
        {canWrite ? (
          <Link href={newHref}>
            <Button>Yeni Urun</Button>
          </Link>
        ) : null}
      </header>

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Kod</th>
                <th className="px-3 py-2 text-left font-medium">Gorsel</th>
                <th className="px-3 py-2 text-left font-medium">Ad</th>
                <th className="px-3 py-2 text-right font-medium">Serbest Stok</th>
                <th className="px-3 py-2 text-right font-medium">Karantina</th>
                <th className="px-3 py-2 text-left font-medium">Saklama</th>
                <th className="px-3 py-2 text-left font-medium">Regulasyon</th>
                {canWrite ? (
                  <th className="px-3 py-2 text-right font-medium">Islem</th>
                ) : null}
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
                const detailHref = companyModulePath(companyId, "materials", row.id);
                const editHref = companyModulePath(companyId, "products", row.id, "edit");
                const thumbnailUrl = thumbnailByPath.get(
                  `${companyId}/products/${row.id}/thumbnail`,
                );
                const deleteAction = deleteMaterial.bind(
                  null,
                  companyId,
                  row.id,
                  companyModulePath(companyId, "products"),
                );

                return (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link href={detailHref} className="hover:underline">
                        {row.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <div className="relative h-10 w-10 overflow-hidden rounded border border-border bg-secondary">
                        {thumbnailUrl ? (
                          <Image
                            src={thumbnailUrl}
                            alt=""
                            fill
                            sizes="40px"
                            className="object-cover"
                            unoptimized
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {formatNumber(released)}{" "}
                      <span className="text-muted-foreground">{row.base_uom}</span>
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
                      {row.storage_conditions ?? "--"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {row.regulatory_notes ?? "--"}
                    </td>
                    {canWrite ? (
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Link href={editHref}>
                            <Button size="sm" variant="outline">Duzenle</Button>
                          </Link>
                          <form action={deleteAction}>
                            <Button size="sm" variant="destructive" type="submit">
                              Sil
                            </Button>
                          </form>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Henuz bitmis urun yok"
          description="Yeni urun ekleyerek URN kodlu bitmis urun ve taslak recete olusturun."
          action={
            canWrite ? (
              <Link href={newHref}>
                <Button>Urun Ekle</Button>
              </Link>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
