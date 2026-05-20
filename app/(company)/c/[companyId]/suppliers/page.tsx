import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function SuppliersListPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, code, name, tax_number, email, phone, country, created_at")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const newHref = companyModulePath(companyId, "suppliers", "new");

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Tedarikçiler</h1>
          <p className="text-sm text-muted-foreground">
            Hammadde tedarikçileri. Malzeme kayıtlarında varsayılan tedarikçi
            olarak seçilebilir.
          </p>
        </div>
        <Link href={newHref}>
          <Button>Yeni Tedarikçi</Button>
        </Link>
      </header>

      {suppliers && suppliers.length > 0 ? (
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
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{s.code}</td>
                  <td className="px-3 py-2">{s.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {s.tax_number ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {s.email ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {s.phone ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {s.country ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Henüz tedarikçi yok"
          description="İlk tedarikçinizi ekleyin; sonra malzeme kayıtlarında varsayılan tedarikçi olarak seçebilirsiniz."
        />
      )}
    </div>
  );
}
