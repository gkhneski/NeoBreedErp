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
  CHANNEL_LABEL,
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
  status: ShipmentStatus;
  carrier: string | null;
  tracking_no: string | null;
  notes: string | null;
  shipped_at: string | null;
  created_at: string;
  customers: { code: string; name: string } | null;
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
      "id, code, channel, external_order_no, recipient, status, carrier, tracking_no, notes, shipped_at, created_at, " +
        "customers:customer_id(code, name)",
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

  return (
    <div className="max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            <Link
              href={companyModulePath(companyId, "shipments")}
              className="hover:underline"
            >
              ← Siparişler
            </Link>
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Sipariş — {shipment.code}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={SHIPMENT_STATUS_VARIANT[shipment.status]}>
              {SHIPMENT_STATUS_LABEL[shipment.status]}
            </Badge>
            <Badge variant="outline">{CHANNEL_LABEL[shipment.channel]}</Badge>
            <span>
              {shipment.customers
                ? `${shipment.customers.code} — ${shipment.customers.name}`
                : (shipment.recipient ?? "")}
            </span>
          </div>
        </div>
        {editable ? (
          <form action={cancelAction}>
            <Button variant="outline" type="submit">
              Siparişi İptal Et
            </Button>
          </form>
        ) : null}
      </header>

      <section className="grid gap-3 rounded-md border border-border p-4 text-sm sm:grid-cols-2">
        <p>
          <span className="text-muted-foreground">Pazaryeri Sipariş No: </span>
          <span className="font-mono text-xs">
            {shipment.external_order_no ?? "—"}
          </span>
        </p>
        <p>
          <span className="text-muted-foreground">Kargo: </span>
          {shipment.carrier ?? "—"}
          {shipment.tracking_no ? (
            <span className="ml-1 font-mono text-xs">
              ({shipment.tracking_no})
            </span>
          ) : null}
        </p>
        <p>
          <span className="text-muted-foreground">Oluşturma: </span>
          {formatDateTime(shipment.created_at)}
        </p>
        <p>
          <span className="text-muted-foreground">Gönderim: </span>
          {shipment.shipped_at ? formatDateTime(shipment.shipped_at) : "—"}
        </p>
        {shipment.notes ? (
          <p className="sm:col-span-2">
            <span className="text-muted-foreground">Not: </span>
            {shipment.notes}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Kalemler</h2>
        {itemRows.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Lot</th>
                  <th className="px-3 py-2 text-left font-medium">Ürün</th>
                  <th className="px-3 py-2 text-right font-medium">Miktar</th>
                  {editable ? (
                    <th className="px-3 py-2 text-right font-medium">İşlem</th>
                  ) : null}
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
                    <tr key={item.id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">
                        {item.material_lots?.lot_number ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {item.materials ? (
                          <span>
                            <span className="font-mono text-xs">
                              {item.materials.code}
                            </span>
                            <span className="ml-1">
                              — {item.materials.name}
                            </span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {formatNumber(Number(item.quantity))}{" "}
                        {item.materials?.base_uom ?? ""}
                      </td>
                      {editable ? (
                        <td className="px-3 py-2 text-right">
                          <form action={removeAction}>
                            <Button size="sm" variant="outline" type="submit">
                              Çıkar
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
          <p className="text-sm text-muted-foreground">
            Henüz kalem yok. Aşağıdan sevk edilecek lotları ekleyin.
          </p>
        )}

        {editable ? (
          <div className="rounded-md border border-border bg-card/40 p-4">
            <ShipmentItemAddForm
              companyId={companyId}
              shipmentId={shipment.id}
              lots={lotOptions}
            />
          </div>
        ) : null}
      </section>

      {editable ? (
        <section className="rounded-md border border-border p-4">
          <h2 className="mb-1 text-sm font-medium">Gönderim</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            &quot;Gönderildi&quot; işaretlendiğinde her kalem için stok düşülür
            ve sipariş kilitlenir; geri alınamaz.
          </p>
          <ShipForm
            companyId={companyId}
            shipmentId={shipment.id}
            disabled={itemRows.length === 0}
          />
        </section>
      ) : null}
    </div>
  );
}
