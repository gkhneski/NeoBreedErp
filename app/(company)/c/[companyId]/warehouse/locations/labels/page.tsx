import { headers } from "next/headers";
import Link from "next/link";
import QRCode from "qrcode";

import { requireModuleAccess } from "@/lib/auth";
import { groupLocations, type LocationOption } from "@/lib/locations";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

import { PrintButton } from "../print-button";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function LocationLabelsBulkPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireModuleAccess(routeCompanyId, "warehouse");
  const supabase = await createServerSupabaseClient();

  const { data: locations } = await supabase
    .from("locations")
    .select("id, code, name, kind, parent_id, is_default")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("code")
    .returns<LocationOption[]>();

  const rows = locations ?? [];
  const groups = groupLocations(rows);
  const ordered = groups.flatMap((g) => [g.depot, ...g.shelves]);
  const parentCodeById = new Map(rows.map((l) => [l.id, l.code]));

  const headerStore = await headers();
  const host = headerStore.get("host") ?? "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "https";

  const labels = await Promise.all(
    ordered.map(async (location) => ({
      location,
      qrDataUrl: await QRCode.toDataURL(
        `${proto}://${host}/c/${companyId}/warehouse/locations/${location.id}`,
        { errorCorrectionLevel: "M", margin: 1, width: 320 },
      ),
    })),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 print:hidden">
        <Link
          href={companyModulePath(companyId, "settings", "locations")}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← Depolar ve Raflar
        </Link>
        <PrintButton />
        <span className="text-xs text-muted-foreground">
          {labels.length} etiket — her etiket ayrı sayfaya yazdırılır (62mm).
        </span>
      </div>

      {labels.map(({ location, qrDataUrl }) => (
        <div
          key={location.id}
          style={{ breakAfter: "page" }}
          className="mx-auto w-[62mm] space-y-2 border border-border bg-white p-3 text-black print:border-0"
        >
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
            {location.parent_id
              ? ` · ${parentCodeById.get(location.parent_id) ?? ""}`
              : ""}
          </p>
        </div>
      ))}
    </div>
  );
}
