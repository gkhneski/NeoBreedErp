import { requireCompanyRole } from "@/lib/auth";
import { MASTER_DATA_WRITE_ROLES } from "@/types/roles";

import { SupplierForm } from "./supplier-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function NewSupplierPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    MASTER_DATA_WRITE_ROLES,
  );

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Yeni Tedarikçi
        </h1>
        <p className="text-sm text-muted-foreground">
          Kod firma içinde benzersiz olmalı. İletişim alanları opsiyonel.
        </p>
      </header>
      <SupplierForm companyId={companyId} />
    </div>
  );
}
