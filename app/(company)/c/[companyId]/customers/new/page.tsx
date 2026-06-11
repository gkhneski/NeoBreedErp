import { requireCompanyRole } from "@/lib/auth";
import { MASTER_DATA_WRITE_ROLES } from "@/types/roles";

import { CustomerForm } from "./customer-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function NewCustomerPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    MASTER_DATA_WRITE_ROLES,
  );

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Yeni Müşteri
        </h1>
        <p className="text-sm text-muted-foreground">
          Fason üretim yapılan firma kartı. İletişim alanları opsiyonel.
        </p>
      </header>
      <CustomerForm companyId={companyId} />
    </div>
  );
}
