import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  QUALITY_WRITE_ROLES,
  STOCK_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

import { updateLotStatus } from "./actions";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type LotRow = {
  id: string;
  lot_number: string;
  received_at: string | null;
  expiry_date: string | null;
  quantity_on_hand: number;
  unit_cost: number | null;
  currency: string | null;
  status: "quarantine" | "released" | "blocked";
  materials: { code: string; name: string; base_uom: string } | null;
  suppliers: { code: string; name: string } | null;
  customers: { code: string; name: string } | null;
};

const STATUS_LABEL: Record<LotRow["status"], string> = {
  quarantine: "Karantina",
  released: "Serbest",
  blocked: "Bloklu",
};

const STATUS_VARIANT: Record<
  LotRow["status"],
  "default" | "secondary" | "warning" | "destructive"
> = {
  quarantine: "warning",
  released: "default",
  blocked: "destructive",
};

const STATUS_NEXT: Record<LotRow["status"], LotRow["status"][]> = {
  quarantine: ["released", "blocked"],
  released: ["blocked", "quarantine"],
  blocked: ["quarantine", "released"],
};

function daysUntil(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const target = new Date(dateIso + "T00:00:00").getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86_400_000);
}

function formatNumber(n: number): string {
  return Number(n).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

export default async function LotsListPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const { data: lots } = await supabase
    .from("material_lots")
    .select(
      "id, lot_number, received_at, expiry_date, quantity_on_hand, unit_cost, currency, status, " +
        "materials:material_id(code, name, base_uom), " +
        "suppliers:supplier_id(code, name), " +
        "customers:owner_customer_id(code, name)",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("received_at", { ascending: false })
    .returns<LotRow[]>();

  const newHref = companyModulePath(companyId, "lots", "new");
  const rows = lots ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Lotlar</h1>
          <p className="text-sm text-muted-foreground">
            Hammadde lotları: alış tarihi, son kullanma, eldeki miktar ve durum.
            QC sonrası bir lotu &quot;Serbest&quot;e alarak üretime
            kullanılabilir hale getirin.
          </p>
        </div>
        {canWriteCompanyData(role, STOCK_WRITE_ROLES) ? (
          <Link href={newHref}>
            <Button>Yeni Lot (Mal Kabul)</Button>
          </Link>
        ) : null}
      </header>

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Lot No</th>
                <th className="px-3 py-2 text-left font-medium">Malzeme</th>
                <th className="px-3 py-2 text-left font-medium">Tedarikçi</th>
                <th className="px-3 py-2 text-left font-medium">Alış</th>
                <th className="px-3 py-2 text-left font-medium">SKT</th>
                <th className="px-3 py-2 text-right font-medium">Eldeki</th>
                <th className="px-3 py-2 text-right font-medium">Birim Maliyet</th>
                <th className="px-3 py-2 text-left font-medium">Durum</th>
                <th className="px-3 py-2 text-left font-medium">Aksiyon</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((lot) => {
                const dte = daysUntil(lot.expiry_date);
                const expiryBadge =
                  dte === null
                    ? null
                    : dte < 0
                      ? { variant: "destructive" as const, label: "Süresi geçti" }
                      : dte <= 30
                        ? {
                            variant: "warning" as const,
                            label: `${dte} gün kaldı`,
                          }
                        : null;
                return (
                  <tr key={lot.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-mono text-xs">
                      <div className="flex flex-col gap-1">
                        <Link
                          href={`${companyModulePath(companyId, "lots")}/${lot.id}`}
                          className="hover:underline"
                        >
                          {lot.lot_number}
                        </Link>
                        {lot.customers ? (
                          <Badge variant="warning">
                            Müşteri Malı — {lot.customers.name}
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {lot.materials ? (
                        <span>
                          <span className="font-mono text-xs">
                            {lot.materials.code}
                          </span>
                          <span className="ml-1">— {lot.materials.name}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {lot.suppliers ? (
                        <span>
                          <span className="font-mono text-xs">
                            {lot.suppliers.code}
                          </span>
                          <span className="ml-1">— {lot.suppliers.name}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {lot.received_at ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      <div className="flex flex-col gap-1">
                        <span>{lot.expiry_date ?? "—"}</span>
                        {expiryBadge ? (
                          <Badge variant={expiryBadge.variant}>
                            {expiryBadge.label}
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {formatNumber(Number(lot.quantity_on_hand))}{" "}
                      <span className="text-muted-foreground">
                        {lot.materials?.base_uom ?? ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {lot.unit_cost !== null
                        ? `${formatNumber(Number(lot.unit_cost))} ${lot.currency ?? ""}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_VARIANT[lot.status]}>
                        {STATUS_LABEL[lot.status]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {canWriteCompanyData(role, QUALITY_WRITE_ROLES)
                          ? STATUS_NEXT[lot.status].map((next) => (
                              <form key={next} action={updateLotStatus}>
                                <input
                                  type="hidden"
                                  name="company_id"
                                  value={companyId}
                                />
                                <input
                                  type="hidden"
                                  name="lot_id"
                                  value={lot.id}
                                />
                                <input
                                  type="hidden"
                                  name="status"
                                  value={next}
                                />
                                <button
                                  type="submit"
                                  className="rounded-sm border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:bg-secondary"
                                >
                                  {STATUS_LABEL[next]}
                                </button>
                              </form>
                            ))
                          : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Henüz lot yok"
          description="İlk mal kabulünüzü kaydederek bir lot oluşturun. Eldeki miktar otomatik olarak stok hareketlerinden hesaplanır."
        />
      )}
    </div>
  );
}
