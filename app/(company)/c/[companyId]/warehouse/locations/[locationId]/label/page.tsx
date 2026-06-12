import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { requireModuleAccess } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

import { PrintButton } from "../../print-button";

interface PageProps {
  params: Promise<{ companyId: string; locationId: string }>;
}

type LabelLocation = {
  id: string;
  code: string;
  name: string;
  kind: "depot" | "shelf";
  parent: { code: string; name: string } | null;
};

export default async function LocationLabelPage({ params }: PageProps) {
  const { companyId: routeCompanyId, locationId } = await params;
  const { companyId } = await requireModuleAccess(routeCompanyId, "warehouse");
  const supabase = await createServerSupabaseClient();

  const { data: location } = await supabase
    .from("locations")
    .select("id, code, name, kind, parent:parent_id(code, name)")
    .eq("id", locationId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle<LabelLocation>();

  if (!location) notFound();

  const headerStore = await headers();
  const host = headerStore.get("host") ?? "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "https";
  const locationUrl = `${proto}://${host}/c/${companyId}/warehouse/locations/${location.id}`;
  const qrDataUrl = await QRCode.toDataURL(locationUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 print:hidden">
        <Link
          href={companyModulePath(
            companyId,
            "warehouse",
            "locations",
            location.id,
          )}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← Konum detayına dön
        </Link>
        <PrintButton />
      </div>

      <div className="mx-auto w-[62mm] space-y-2 border border-border bg-white p-3 text-black print:border-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt={`${location.code} konum etiketi QR kodu`}
          className="mx-auto h-[40mm] w-[40mm]"
        />
        <p className="text-center font-mono text-2xl font-bold leading-tight">
          {location.code}
        </p>
        <p className="text-center text-xs leading-tight">{location.name}</p>
        <p className="text-center text-xs uppercase">
          {location.kind === "shelf" ? "Raf" : "Depo"}
          {location.parent ? ` · ${location.parent.code}` : ""}
        </p>
      </div>
    </div>
  );
}
