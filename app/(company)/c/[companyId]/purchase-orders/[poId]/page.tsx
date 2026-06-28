import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { requireModuleAccess } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PurchaseOrderStatus } from "@/types/database";
import {
  STOCK_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

import { PoActions } from "../po-actions-client";

interface PageProps {
  params: Promise<{ companyId: string; poId: string }>;
}

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: "Taslak",
  sent: "Gönderildi",
  received: "Mal Kabul",
  cancelled: "İptal",
};

const num = (n: number) =>
  Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 3 });

type Po = {
  id: string;
  code: string;
  status: PurchaseOrderStatus;
  currency: string | null;
  notes: string | null;
  suppliers: { code: string; name: string } | null;
  purchase_order_lines: Array<{
    id: string;
    quantity: number;
    uom: string;
    unit_cost: number | null;
    received_quantity: number;
    materials: { code: string; name: string } | null;
  }> | null;
};

export default async function PurchaseOrderDetailPage({ params }: PageProps) {
  const { companyId: routeCompanyId, poId } = await params;
  const { companyId, role } = await requireModuleAccess(
    routeCompanyId,
    "purchase-orders",
  );
  const canWrite = canWriteCompanyData(role, STOCK_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  const { data: po } = await supabase
    .from("purchase_orders")
    .select(
      "id, code, status, currency, notes, suppliers:supplier_id(code, name), " +
        "purchase_order_lines(id, quantity, uom, unit_cost, received_quantity, materials:material_id(code, name))",
    )
    .eq("id", poId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle<Po>();

  if (!po) notFound();

  const lines = po.purchase_order_lines ?? [];

  return (
    <div className="max-w-4xl space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          <Link
            href={companyModulePath(companyId, "purchase-orders")}
            className="hover:underline"
          >
            ← Satınalma Siparişleri
          </Link>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{po.code}</h1>
          <Badge variant="secondary">{STATUS_LABEL[po.status]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Tedarikçi: {po.suppliers ? `${po.suppliers.code} · ${po.suppliers.name}` : "— atanmamış"}
        </p>
      </header>

      {canWrite ? (
        <PoActions companyId={companyId} poId={po.id} status={po.status} />
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Malzeme</th>
              <th className="px-3 py-2 text-right">Miktar</th>
              <th className="px-3 py-2 text-right">Birim Maliyet</th>
              <th className="px-3 py-2 text-right">Alınan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2">
                  {l.materials ? `${l.materials.code} · ${l.materials.name}` : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {num(l.quantity)} {l.uom}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {l.unit_cost === null ? "—" : num(l.unit_cost)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {num(l.received_quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
