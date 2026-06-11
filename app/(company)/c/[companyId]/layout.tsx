import { Suspense } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { CompanySidebar } from "@/components/layout/company-sidebar";
import { FlashToast } from "@/components/ui/flash-toast";
import { requireCompanyUser } from "@/lib/auth";
import { getCompanySummary } from "@/lib/company";
import { COMPANY_ROLE_BADGE_LABELS } from "@/types/roles";

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
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
          <div className="flex h-14 items-center justify-between gap-4 px-6">
            <span className="truncate text-sm">
              <span className="text-muted-foreground">Aktif firma: </span>
              <span className="font-medium">{company?.name ?? "—"}</span>
            </span>
            <div className="flex items-center gap-3 text-xs">
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                {COMPANY_ROLE_BADGE_LABELS[role]}
              </span>
              <span className="hidden text-muted-foreground sm:inline">
                {ctx.email}
              </span>
              <SignOutButton />
            </div>
          </div>
        </header>

        <main className="flex-1 px-6 py-6">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>

      <Suspense fallback={null}>
        <FlashToast />
      </Suspense>
    </div>
  );
}
