import { requireCompanyUser } from "@/lib/auth";

import { MaterialForm } from "./material-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function NewMaterialPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyUser(routeCompanyId);

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Yeni Malzeme</h1>
        <p className="text-sm text-muted-foreground">
          Kod ve ad firma içinde benzersiz olmalı. Lot ve stok bilgisi Faz 5b&apos;de eklenecek.
        </p>
      </header>
      <MaterialForm companyId={companyId} />
    </div>
  );
}
