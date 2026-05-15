import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

const TYPE_LABEL: Record<string, string> = {
  raw: "Hammadde",
  finished: "Bitmiş Ürün",
};

export default async function MaterialsListPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const { data: materials } = await supabase
    .from("materials")
    .select("id, code, name, type, base_uom, density, created_at")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const newHref = companyModulePath(companyId, "materials", "new");

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Malzemeler</h1>
          <p className="text-sm text-muted-foreground">
            Hammaddeler ve bitmiş ürünler. Lot/stok yönetimi Faz 5b&apos;de gelecek.
          </p>
        </div>
        <Link href={newHref}>
          <Button>Yeni Malzeme</Button>
        </Link>
      </header>

      {materials && materials.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Kod</th>
                <th className="px-3 py-2 text-left font-medium">Ad</th>
                <th className="px-3 py-2 text-left font-medium">Tip</th>
                <th className="px-3 py-2 text-left font-medium">Birim</th>
                <th className="px-3 py-2 text-right font-medium">Yoğunluk</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{m.code}</td>
                  <td className="px-3 py-2">{m.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {TYPE_LABEL[m.type] ?? m.type}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{m.base_uom}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {m.density ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Henüz malzeme yok"
          description="İlk hammadde veya bitmiş ürününüzü ekleyerek başlayın. Reçeteler bu malzemeleri referans alır."
        />
      )}
    </div>
  );
}
