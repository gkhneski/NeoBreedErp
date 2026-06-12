import { Fragment } from "react";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireCompanyRole } from "@/lib/auth";
import { groupLocations, type LocationOption } from "@/lib/locations";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { deleteLocation } from "./actions";
import { LocationForm } from "./location-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type LocationRow = LocationOption & { notes: string | null };

export default async function LocationsSettingsPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: locations } = await supabase
    .from("locations")
    .select("id, code, name, kind, parent_id, is_default, notes")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("code")
    .returns<LocationRow[]>();

  const rows = locations ?? [];
  const groups = groupLocations(rows);
  const depots = groups.map((g) => ({
    id: g.depot.id,
    code: g.depot.code,
    name: g.depot.name,
  }));
  const labelPath = (locationId: string) =>
    companyModulePath(companyId, "warehouse", "locations", locationId, "label");

  function LocationRow({
    location,
    indent,
  }: {
    location: LocationRow;
    indent: boolean;
  }) {
    const deleteAction = deleteLocation.bind(null, companyId, location.id);
    return (
      <tr className="border-t border-border">
        <td className={`px-3 py-2 font-mono text-xs ${indent ? "pl-8" : ""}`}>
          {indent ? <span className="text-muted-foreground">└ </span> : null}
          {location.code}
        </td>
        <td className="px-3 py-2">
          {location.name}{" "}
          {location.kind === "shelf" ? (
            <Badge variant="outline">Raf</Badge>
          ) : null}{" "}
          {location.is_default ? (
            <Badge variant="secondary">Varsayılan</Badge>
          ) : null}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">
          {location.notes ?? "—"}
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex justify-end gap-2">
            <Link href={labelPath(location.id)}>
              <Button size="sm" variant="outline" type="button">
                Etiket
              </Button>
            </Link>
            {!location.is_default ? (
              <form action={deleteAction}>
                <Button size="sm" variant="destructive" type="submit">
                  Sil
                </Button>
              </form>
            ) : null}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            <Link
              href={companyModulePath(companyId, "settings")}
              className="hover:underline"
            >
              ← Ayarlar
            </Link>
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Depolar ve Raflar
          </h1>
          <p className="text-sm text-muted-foreground">
            Lotlar bir depoda veya rafta bulunur ve tam lot olarak transfer
            edilir. Varsayılan depo silinemez; içinde lot veya raf olan konum
            silinemez. Her konumun QR etiketi yazdırılabilir.
          </p>
        </div>
        <Link href={companyModulePath(companyId, "warehouse", "locations", "labels")}>
          <Button variant="outline">Tüm Etiketleri Yazdır</Button>
        </Link>
      </header>

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Kod</th>
              <th className="px-3 py-2 text-left font-medium">Ad</th>
              <th className="px-3 py-2 text-left font-medium">Notlar</th>
              <th className="px-3 py-2 text-right font-medium">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group.depot.id}>
                <LocationRow location={group.depot} indent={false} />
                {group.shelves.map((shelf) => (
                  <LocationRow key={shelf.id} location={shelf} indent />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <section className="space-y-3 rounded-md border border-border bg-card/40 p-4">
        <h2 className="text-sm font-semibold">Yeni Depo / Raf</h2>
        <LocationForm companyId={companyId} depots={depots} />
      </section>
    </div>
  );
}
