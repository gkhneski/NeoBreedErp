import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  MASTER_DATA_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

import { deleteCustomer } from "./actions";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function CustomersListPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const { data: customers } = await supabase
    .from("customers")
    .select("id, code, name, tax_number, email, phone, country, created_at")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const newHref = companyModulePath(companyId, "customers", "new");
  const canWrite = canWriteCompanyData(role, MASTER_DATA_WRITE_ROLES);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Müşteriler</h1>
          <p className="text-sm text-muted-foreground">
            Fason üretim yapılan firmalar. Kodlar MUS-01 formatında otomatik
            verilir; müşterilerin sisteme girişi yoktur.
          </p>
        </div>
        {canWrite ? (
          <Link href={newHref}>
            <Button>Yeni Müşteri</Button>
          </Link>
        ) : null}
      </header>

      {customers && customers.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Kod</th>
                <th className="px-3 py-2 text-left font-medium">Ad</th>
                <th className="px-3 py-2 text-left font-medium">Vergi No</th>
                <th className="px-3 py-2 text-left font-medium">E-posta</th>
                <th className="px-3 py-2 text-left font-medium">Telefon</th>
                <th className="px-3 py-2 text-left font-medium">Ülke</th>
                {canWrite ? (
                  <th className="px-3 py-2 text-right font-medium">İşlem</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const editHref = companyModulePath(companyId, "customers", c.id, "edit");
                const deleteAction = deleteCustomer.bind(null, companyId, c.id);
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">{c.code}</td>
                    <td className="px-3 py-2">{c.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {c.tax_number ?? "--"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {c.email ?? "--"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {c.phone ?? "--"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {c.country ?? "--"}
                    </td>
                    {canWrite ? (
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Link href={editHref}>
                            <Button size="sm" variant="outline">Düzenle</Button>
                          </Link>
                          <form action={deleteAction}>
                            <Button size="sm" variant="destructive" type="submit">
                              Sil
                            </Button>
                          </form>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Henüz müşteri yok"
          description="İlk müşterinizi ekleyin; sonra üretim emirlerinde 'Müşteri (Fason)' olarak seçebilirsiniz."
        />
      )}
    </div>
  );
}
