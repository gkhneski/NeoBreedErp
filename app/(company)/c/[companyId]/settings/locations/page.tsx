import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { deleteLocation } from "./actions";
import { LocationForm } from "./location-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function LocationsSettingsPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { data: locations } = await supabase
    .from("locations")
    .select("id, code, name, is_default, notes")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("code");

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          <Link
            href={companyModulePath(companyId, "settings")}
            className="hover:underline"
          >
            ← Ayarlar
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Depolar</h1>
        <p className="text-sm text-muted-foreground">
          Lotlar bir depoda bulunur ve depolar arasında tam lot olarak transfer
          edilir. Varsayılan depo silinemez; içinde lot olan depo silinemez.
        </p>
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
            {(locations ?? []).map((l) => {
              const deleteAction = deleteLocation.bind(null, companyId, l.id);
              return (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{l.code}</td>
                  <td className="px-3 py-2">
                    {l.name}{" "}
                    {l.is_default ? (
                      <Badge variant="secondary">Varsayılan</Badge>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {l.notes ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!l.is_default ? (
                      <form action={deleteAction}>
                        <Button size="sm" variant="destructive" type="submit">
                          Sil
                        </Button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="space-y-3 rounded-md border border-border bg-card/40 p-4">
        <h2 className="text-sm font-semibold">Yeni Depo</h2>
        <LocationForm companyId={companyId} />
      </section>
    </div>
  );
}
