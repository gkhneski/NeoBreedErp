import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ShipmentChannel, ShipmentStatus } from "@/types/database";
import {
  SHIPMENT_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

interface PageProps {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ durum?: string }>;
}

type ShipmentRow = {
  id: string;
  code: string;
  channel: ShipmentChannel;
  external_order_no: string | null;
  recipient: string | null;
  status: ShipmentStatus;
  shipped_at: string | null;
  created_at: string;
  customers: { code: string; name: string } | null;
};

import {
  CHANNEL_LABEL,
  SHIPMENT_STATUS_LABEL as STATUS_LABEL,
  SHIPMENT_STATUS_VARIANT as STATUS_VARIANT,
} from "./labels";

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "Tümü" },
  { value: "open", label: "Açık" },
  { value: "preparing", label: "Hazırlanıyor" },
  { value: "shipped", label: "Gönderildi" },
  { value: "cancelled", label: "İptal" },
];

export default async function ShipmentsListPage({
  params,
  searchParams,
}: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { durum } = await searchParams;
  const { companyId, role } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const statusFilter =
    durum && ["open", "preparing", "shipped", "cancelled"].includes(durum)
      ? (durum as ShipmentStatus)
      : null;

  let query = supabase
    .from("shipments")
    .select(
      "id, code, channel, external_order_no, recipient, status, shipped_at, created_at, " +
        "customers:customer_id(code, name)",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (statusFilter) query = query.eq("status", statusFilter);

  const { data: shipments } = await query.returns<ShipmentRow[]>();
  const rows = shipments ?? [];
  const canWrite = canWriteCompanyData(role, SHIPMENT_WRITE_ROLES);
  const baseHref = companyModulePath(companyId, "shipments");

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Siparişler</h1>
          <p className="text-sm text-muted-foreground">
            Ecza depoları ve pazaryeri (Trendyol / Hepsiburada) siparişlerinin
            hazırlanması ve sevkiyatı. Gönderim, lot bazında stok düşer.
          </p>
        </div>
        {canWrite ? (
          <Link href={companyModulePath(companyId, "shipments", "new")}>
            <Button>Yeni Sipariş</Button>
          </Link>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => {
          const active = (statusFilter ?? "") === f.value;
          return (
            <Link
              key={f.value || "all"}
              href={f.value ? `${baseHref}?durum=${f.value}` : baseHref}
            >
              <Button size="sm" variant={active ? "default" : "outline"}>
                {f.label}
              </Button>
            </Link>
          );
        })}
      </div>

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Kod</th>
                <th className="px-3 py-2 text-left font-medium">Kanal</th>
                <th className="px-3 py-2 text-left font-medium">Alıcı</th>
                <th className="px-3 py-2 text-left font-medium">Sipariş No</th>
                <th className="px-3 py-2 text-left font-medium">Oluşturma</th>
                <th className="px-3 py-2 text-left font-medium">Gönderim</th>
                <th className="px-3 py-2 text-left font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link
                      href={companyModulePath(companyId, "shipments", s.id)}
                      className="hover:underline"
                    >
                      {s.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{CHANNEL_LABEL[s.channel]}</td>
                  <td className="px-3 py-2">
                    {s.customers
                      ? s.customers.name
                      : (s.recipient ?? (
                          <span className="text-muted-foreground">—</span>
                        ))}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {s.external_order_no ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDateTime(s.created_at)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {s.shipped_at ? formatDateTime(s.shipped_at) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={STATUS_VARIANT[s.status]}>
                      {STATUS_LABEL[s.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Bu filtrede sipariş yok"
          description="Yeni Sipariş ile ecza deposu veya pazaryeri siparişi açabilirsiniz."
        />
      )}
    </div>
  );
}
