import {
  ArrowLeft,
  Building2,
  Clock,
  Hash,
  MapPin,
  Package,
  Phone,
  Send,
  Tag,
  Trash2,
  Truck,
  User,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireCompanyUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ShipmentChannel, ShipmentStatus } from "@/types/database";
import {
  SHIPMENT_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

import { cancelShipment, removeShipmentItem } from "../actions";
import {
  channelLabel,
  SHIPMENT_STATUS_LABEL,
  SHIPMENT_STATUS_VARIANT,
} from "../labels";
import { ShipmentItemAddForm } from "./item-add-form";
import { ShipForm } from "./ship-form";

interface PageProps {
  params: Promise<{ companyId: string; shipmentId: string }>;
}

type ShipmentDetail = {
  id: string;
  code: string;
  channel: ShipmentChannel;
  external_order_no: string | null;
  recipient: string | null;
  recipient_phone: string | null;
  recipient_city: string | null;
  recipient_address: string | null;
  status: ShipmentStatus;
  carrier: string | null;
  tracking_no: string | null;
  notes: string | null;
  shipped_at: string | null;
  created_at: string;
  customers: { code: string; name: string } | null;
  shipment_channels: { name: string } | null;
};

type ItemRow = {
  id: string;
  quantity: number;
  material_lots: { lot_number: string; quantity_on_hand: number } | null;
  materials: { code: string; name: string; base_uom: string } | null;
};

type PickableLot = {
  id: string;
  lot_number: string;
  quantity_on_hand: number;
  materials: { code: string; name: string; base_uom: string } | null;
  locations: { name: string } | null;
};

function formatNumber(n: number): string {
  return Number(n).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

export default async function ShipmentDetailPage({ params }: PageProps) {
  const { companyId: routeCompanyId, shipmentId } = await params;
  const { companyId, role } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const { data: shipment } = await supabase
    .from("shipments")
    .select(
      "id, code, channel, external_order_no, recipient, recipient_phone, recipient_city, recipient_address, status, carrier, tracking_no, notes, shipped_at, created_at, " +
        "customers:customer_id(code, name), shipment_channels:channel_id(name)",
    )
    .eq("id", shipmentId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle<ShipmentDetail>();

  if (!shipment) notFound();

  // Depo personeli sevkiyata yalnizca bitmis urun lotu ekleyebilir.
  const isOperator = role === "operator";

  const [{ data: items }, { data: pickableLots }] = await Promise.all([
    supabase
      .from("shipment_items")
      .select(
        "id, quantity, " +
          "material_lots:lot_id(lot_number, quantity_on_hand), " +
          "materials:material_id(code, name, base_uom)",
      )
      .eq("shipment_id", shipment.id)
      .eq("company_id", companyId)
      .order("created_at")
      .returns<ItemRow[]>(),
    (() => {
      let q = supabase
        .from("material_lots")
        .select(
          "id, lot_number, quantity_on_hand, " +
            `materials:material_id${isOperator ? "!inner" : ""}(code, name, base_uom, type), ` +
            "locations:location_id(name)",
        )
        .eq("company_id", companyId)
        .eq("status", "released")
        .gt("quantity_on_hand", 0)
        .is("deleted_at", null);
      if (isOperator) q = q.eq("materials.type", "finished");
      return q.order("lot_number").limit(300).returns<PickableLot[]>();
    })(),
  ]);

  const itemRows = items ?? [];
  const editable =
    (shipment.status === "open" || shipment.status === "preparing") &&
    canWriteCompanyData(role, SHIPMENT_WRITE_ROLES);
  const cancelAction = cancelShipment.bind(null, companyId, shipment.id);

  const lotOptions = (pickableLots ?? []).map((l) => ({
    id: l.id,
    lot_number: l.lot_number,
    quantity_on_hand: Number(l.quantity_on_hand),
    material_code: l.materials?.code ?? "",
    material_name: l.materials?.name ?? "",
    base_uom: l.materials?.base_uom ?? "",
    location_name: l.locations?.name ?? null,
  }));

  const totalQty = itemRows.reduce((s, i) => s + Number(i.quantity), 0);
  const recipientCity = shipment.recipient_city;
  const recipientAddress = shipment.recipient_address;
  const hasRecipient =
    shipment.customers || shipment.recipient || shipment.recipient_phone;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="space-y-3">
        <Link
          href={companyModulePath(companyId, "shipments")}
          className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Siparişler
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                {shipment.code}
              </h1>
              <Badge variant={SHIPMENT_STATUS_VARIANT[shipment.status]}>
                {SHIPMENT_STATUS_LABEL[shipment.status]}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" />
                {channelLabel(shipment.channel, shipment.shipment_channels)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {formatDateTime(shipment.created_at)}
              </span>
              {shipment.external_order_no ? (
                <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                  <Hash className="h-3.5 w-3.5" />
                  {shipment.external_order_no}
                </span>
              ) : null}
            </div>
          </div>
          {editable ? (
            <form action={cancelAction}>
              <Button variant="outline" type="submit" className="rounded-lg">
                Siparişi İptal Et
              </Button>
            </form>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-600/10 text-green-700">
              {shipment.channel === "sahis" ? (
                <User className="h-4 w-4" />
              ) : (
                <Building2 className="h-4 w-4" />
              )}
            </span>
            <h2 className="text-base font-semibold">Alıcı</h2>
          </div>
          {hasRecipient ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  {shipment.customers?.name ?? shipment.recipient ?? "—"}
                </p>
                {shipment.customers ? (
                  <p className="text-xs text-muted-foreground">
                    {shipment.customers.code}
                    {shipment.recipient &&
                    shipment.recipient !== shipment.customers.name
                      ? ` · ${shipment.recipient}`
                      : ""}
                  </p>
                ) : null}
              </div>
              <div className="flex items-start gap-2 text-sm">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{shipment.recipient_phone ?? "—"}</span>
              </div>
              <div className="flex items-start gap-2 text-sm sm:col-span-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="leading-5">
                  {recipientAddress || recipientCity ? (
                    <>
                      {recipientAddress}
                      {recipientAddress && recipientCity ? ", " : ""}
                      {recipientCity ? (
                        <span className="font-medium">{recipientCity}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      Adres girilmemiş
                    </span>
                  )}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Alıcı bilgisi girilmemiş.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-600/10 text-green-700">
              <Truck className="h-4 w-4" />
            </span>
            <h2 className="text-base font-semibold">Kargo</h2>
          </div>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Firma</dt>
              <dd className="font-medium">{shipment.carrier ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Takip No</dt>
              <dd className="font-mono text-xs">
                {shipment.tracking_no ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Gönderim</dt>
              <dd className="font-medium">
                {shipment.shipped_at
                  ? formatDateTime(shipment.shipped_at)
                  : "Henüz gönderilmedi"}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {shipment.notes ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-sm dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Not
          </p>
          <p className="whitespace-pre-wrap">{shipment.notes}</p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-600/10 text-green-700">
              <Package className="h-4 w-4" />
            </span>
            <h2 className="text-base font-semibold">Kalemler</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {itemRows.length}
            </span>
          </div>
          {itemRows.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Toplam{" "}
              <span className="font-mono font-medium text-foreground">
                {formatNumber(totalQty)}
              </span>
            </p>
          ) : null}
        </div>

        {itemRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">Ürün</th>
                  <th className="px-3 py-2.5 text-left font-medium">Lot</th>
                  <th className="px-3 py-2.5 text-right font-medium">Miktar</th>
                  {editable ? <th className="w-20 px-5 py-2.5" /> : null}
                </tr>
              </thead>
              <tbody>
                {itemRows.map((item) => {
                  const removeAction = removeShipmentItem.bind(
                    null,
                    companyId,
                    shipment.id,
                    item.id,
                  );
                  return (
                    <tr
                      key={item.id}
                      className="border-t border-border transition-colors hover:bg-muted/30"
                    >
                      <td className="px-5 py-3">
                        {item.materials ? (
                          <div>
                            <p className="font-medium">{item.materials.name}</p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {item.materials.code}
                            </p>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">
                        {item.material_lots?.lot_number ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-sm font-medium">
                        {formatNumber(Number(item.quantity))}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          {item.materials?.base_uom ?? ""}
                        </span>
                      </td>
                      {editable ? (
                        <td className="px-5 py-3 text-right">
                          <form action={removeAction}>
                            <Button
                              size="sm"
                              variant="ghost"
                              type="submit"
                              className="h-8 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Çıkar</span>
                            </Button>
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-8 text-center">
            <Package className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Henüz kalem yok.
              {editable ? " Aşağıdan sevk edilecek lotları ekleyin." : ""}
            </p>
          </div>
        )}

        {editable ? (
          <div className="border-t border-border bg-muted/30 px-5 py-4">
            <ShipmentItemAddForm
              companyId={companyId}
              shipmentId={shipment.id}
              lots={lotOptions}
            />
          </div>
        ) : null}
      </section>

      {editable ? (
        <section className="rounded-2xl border border-green-600/30 bg-gradient-to-br from-green-50 to-emerald-50/40 p-5 shadow-sm dark:from-green-950/30 dark:to-emerald-950/10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-600 text-white">
                <Send className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-base font-semibold">Gönderim</h2>
                <p className="text-xs text-muted-foreground">
                  &quot;Gönderildi&quot; işaretlendiğinde her kalem stoktan
                  düşülür ve sipariş kilitlenir; geri alınamaz.
                </p>
              </div>
            </div>
            <ShipForm
              companyId={companyId}
              shipmentId={shipment.id}
              disabled={itemRows.length === 0}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
