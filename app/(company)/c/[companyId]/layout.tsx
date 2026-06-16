import { Suspense } from "react";

import { CompanySidebar } from "@/components/layout/company-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { FlashToast } from "@/components/ui/flash-toast";
import { requireCompanyUser } from "@/lib/auth";
import { getCompanySummary } from "@/lib/company";
import { canAccessModule } from "@/types/roles";

import { GlobalSearch } from "./global-search";
import { SalesOrderNotifier } from "./sales-order-notifier";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ companyId: string }>;
}

export default async function CompanyAppLayout({ children, params }: LayoutProps) {
  const { companyId: routeCompanyId } = await params;
  const { ctx, companyId, role } = await requireCompanyUser(routeCompanyId);
  const company = await getCompanySummary(companyId);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 md:block">
        <CompanySidebar
          companyId={companyId}
          companyName={company?.name ?? "Firma"}
          role={role}
          email={ctx.email ?? ""}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 md:px-6">
            <MobileNav>
              <CompanySidebar
                companyId={companyId}
                companyName={company?.name ?? "Firma"}
                role={role}
                email={ctx.email ?? ""}
              />
            </MobileNav>
            <GlobalSearch companyId={companyId} />
          </div>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>

      {canAccessModule(role, "sales-orders") ? (
        <SalesOrderNotifier companyId={companyId} />
      ) : null}

      <Suspense fallback={null}>
        <FlashToast />
      </Suspense>
    </div>
  );
}
