import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

import { PrintButton } from "./print-button";

interface PageProps {
  params: Promise<{ companyId: string; lotId: string }>;
}

type LabelLot = {
  id: string;
  lot_number: string;
  expiry_date: string | null;
  status: string;
  materials: { code: string; name: string; base_uom: string } | null;
  customers: { name: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  quarantine: "KARANTİNA",
  released: "SERBEST",
  blocked: "BLOKLU",
};

export default async function LotLabelPage({ params }: PageProps) {
  const { companyId: routeCompanyId, lotId } = await params;
  const { companyId } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const { data: lot } = await supabase
    .from("material_lots")
    .select(
      "id, lot_number, expiry_date, status, " +
        "materials:material_id(code, name, base_uom), " +
        "customers:owner_customer_id(name)",
    )
    .eq("id", lotId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle<LabelLot>();

  if (!lot) notFound();

  const headerStore = await headers();
  const host = headerStore.get("host") ?? "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "https";
  const lotUrl = `${proto}://${host}/c/${companyId}/lots/${lot.id}`;
  const qrDataUrl = await QRCode.toDataURL(lotUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 print:hidden">
        <Link
          href={companyModulePath(companyId, "lots", lot.id)}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← Lot detayına dön
        </Link>
        <PrintButton />
      </div>

      <div className="mx-auto w-[62mm] space-y-2 border border-border bg-white p-3 text-black print:border-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt={`Lot ${lot.lot_number} QR`} className="mx-auto h-[40mm] w-[40mm]" />
        <p className="text-center font-mono text-lg font-bold leading-tight">
          {lot.lot_number}
        </p>
        {lot.materials ? (
          <p className="text-center text-xs leading-tight">
            <span className="font-mono">{lot.materials.code}</span>
            <br />
            {lot.materials.name}
          </p>
        ) : null}
        <p className="text-center text-xs">
          SKT: {lot.expiry_date ?? "—"} · {STATUS_LABEL[lot.status] ?? lot.status}
        </p>
        {lot.customers ? (
          <p className="border-2 border-black p-1 text-center text-xs font-bold uppercase">
            Müşteri Malı — {lot.customers.name}
          </p>
        ) : null}
      </div>
    </div>
  );
}
