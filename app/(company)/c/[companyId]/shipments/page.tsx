import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import {
  isCancelledStatus,
  isShippedStatus,
  trendyolStatusLabel,
  trendyolStatusVariant,
} from "@/lib/marketplaces/order-status";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import type {
  MarketplaceAutoShipStatus,
  ShipmentChannel,
  ShipmentStatus,
} from "@/types/database";
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
import { RetryAutoShipButton, ReturnToStockButton } from "./marketplace-order-actions";

type TrendyolOrderRow = {
  order_number: string;
  status: string | null;
  customer_name: string | null;
  order_date: string | null;
  lines: Array<{ name: string; quantity: number }> | null;
  shipment_id: string | null;
  auto_ship_status: MarketplaceAutoShipStatus | null;
  auto_ship_error: string | null;
  shipments: { code: string } | null;
};

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

  const { data: tyOrders } = await supabase
    .from("marketplace_orders")
    .select(
      "order_number, status, customer_name, order_date, lines, shipment_id, auto_ship_status, auto_ship_error, " +
        "shipments:shipment_id(code)",
    )
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .order("order_date", { ascending: false, nullsFirst: false })
    .limit(100)
    .returns<TrendyolOrderRow[]>();
  const tyRows = tyOrders ?? [];

  // Otomatik sevkiyat anahtarı deny-all tabloda; guard geçildi, yalnızca bayrak okunur.
  const { data: autoShipConn } = await createServiceRoleClient()
    .from("marketplace_connections")
    .select("auto_ship, auto_ship_enabled_at")
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .eq("enabled", true)
    .maybeSingle();
  const autoShipOn = !!autoShipConn?.auto_ship;
  const autoShipSince = autoShipConn?.auto_ship_enabled_at ?? null;

  const inAutoWindow = (o: TrendyolOrderRow) =>
    autoShipOn && !!autoShipSince && !!o.order_date && o.order_date >= autoShipSince;
  const failedRows = tyRows.filter(
    (o) => !o.shipment_id && o.auto_ship_status === "failed" && inAutoWindow(o),
  );
  const returnRows = tyRows.filter(
    (o) =>
      !!o.shipment_id &&
      isCancelledStatus(o.status) &&
      (o.auto_ship_status === "shipped" || o.auto_ship_status === "manual"),
  );
  const exceptions = [...returnRows, ...failedRows];
  const exceptionKeys = new Set(exceptions.map((o) => o.order_number));

  function erpCell(o: TrendyolOrderRow) {
    if (o.shipment_id) {
      return (
        <span className="inline-flex flex-wrap items-center gap-1">
          <Link
            href={companyModulePath(companyId, "shipments", o.shipment_id)}
            className="font-mono text-xs hover:underline"
          >
            {o.shipments?.code ?? "Sevkiyat"}
          </Link>
          {o.auto_ship_status === "returned" ? (
            <Badge variant="secondary">Geri alındı</Badge>
          ) : o.auto_ship_status === "manual" ? (
            <Badge variant="outline">Elle</Badge>
          ) : (
            <Badge variant="success">Düşüldü</Badge>
          )}
        </span>
      );
    }
    if (o.auto_ship_status === "failed" && inAutoWindow(o)) {
      return <Badge variant="destructive">Düşülemedi</Badge>;
    }
    if (isShippedStatus(o.status)) {
      return inAutoWindow(o) ? (
        <Badge variant="warning">Sırada</Badge>
      ) : (
        <span className="text-xs text-muted-foreground">Elle düşülür</span>
      );
    }
    return <span className="text-xs text-muted-foreground">—</span>;
  }

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

      {exceptions.length > 0 ? (
        <section className="space-y-2 rounded-md border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-800 dark:bg-amber-900/10">
          <h2 className="text-sm font-semibold">
            Dikkat Gerektiren Trendyol Siparişleri ({exceptions.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            Otomatik düşülemeyen siparişler ve iade/iptal olup depoya geri
            alınması gerekenler. Düşülemeyen siparişin ürünü stoğa girilince
            <em> Tekrar Dene</em> ile hemen düşülür; aksi halde 5 dakikada bir
            kendiliğinden denenir.
          </p>
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Sipariş No</th>
                  <th className="px-3 py-2 text-left font-medium">Ürün</th>
                  <th className="px-3 py-2 text-left font-medium">Durum</th>
                  <th className="px-3 py-2 text-left font-medium">Sorun</th>
                  {canWrite ? <th className="px-3 py-2 text-right font-medium">İşlem</th> : null}
                </tr>
              </thead>
              <tbody>
                {exceptions.map((o) => {
                  const needsReturn = !!o.shipment_id;
                  return (
                    <tr key={o.order_number} className="border-t border-border align-top">
                      <td className="px-3 py-2 font-mono text-xs">{o.order_number}</td>
                      <td className="max-w-xs px-3 py-2 text-xs text-muted-foreground">
                        <span className="line-clamp-2">
                          {(o.lines ?? [])
                            .map((l) => `${l.name} x${l.quantity}`)
                            .join(", ") || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={trendyolStatusVariant(o.status)}>
                          {trendyolStatusLabel(o.status)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {needsReturn ? (
                          <span>
                            Sipariş {trendyolStatusLabel(o.status).toLocaleLowerCase("tr-TR")};
                            stoktan düşülmüştü ({o.shipments?.code ?? "sevkiyat"}). Kutu
                            geri geldiyse depoya alın.
                          </span>
                        ) : (
                          <span className="text-destructive">{o.auto_ship_error ?? "Düşülemedi"}</span>
                        )}
                      </td>
                      {canWrite ? (
                        <td className="px-3 py-2">
                          {needsReturn ? (
                            <ReturnToStockButton companyId={companyId} orderNumber={o.order_number} />
                          ) : (
                            <RetryAutoShipButton companyId={companyId} orderNumber={o.order_number} />
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tyRows.length > 0 ? (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">
              Trendyol Siparişleri ({tyRows.length})
            </h2>
            {autoShipOn ? (
              <Badge variant="success">Otomatik düşüm açık</Badge>
            ) : (
              <Badge variant="secondary">Otomatik düşüm kapalı</Badge>
            )}
          </div>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Tarih / Saat</th>
                  <th className="px-3 py-2 text-left font-medium">Sipariş No</th>
                  <th className="px-3 py-2 text-left font-medium">Müşteri</th>
                  <th className="px-3 py-2 text-left font-medium">Ürün</th>
                  <th className="px-3 py-2 text-left font-medium">Trendyol Durumu</th>
                  <th className="px-3 py-2 text-left font-medium">ERP Stok</th>
                </tr>
              </thead>
              <tbody>
                {tyRows.map((o) => (
                  <tr
                    key={o.order_number}
                    className={
                      exceptionKeys.has(o.order_number)
                        ? "border-t border-border bg-amber-50/40 dark:bg-amber-900/10"
                        : "border-t border-border"
                    }
                  >
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {o.order_date ? formatDateTime(o.order_date) : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {o.order_number}
                    </td>
                    <td className="px-3 py-2">{o.customer_name ?? "—"}</td>
                    <td className="max-w-xs px-3 py-2 text-xs text-muted-foreground">
                      <span className="line-clamp-2">
                        {(o.lines ?? [])
                          .map((l) => `${l.name} x${l.quantity}`)
                          .join(", ") || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={trendyolStatusVariant(o.status)}>
                        {trendyolStatusLabel(o.status)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">{erpCell(o)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Pazaryeri siparişleri 5 dakikada bir otomatik güncellenir.
            {autoShipOn
              ? " Kargoya verilen sipariş en yakın SKT'li serbest lottan düşülür."
              : " Stok düşümü için Yeni Sipariş ile Trendyol kanalında sevkiyat açın."}
          </p>
        </section>
      ) : null}

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
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-sm">
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
