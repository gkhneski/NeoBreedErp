import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { CompanySidebar } from "@/components/layout/company-sidebar";
import { requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { COMPANY_ROLE_BADGE_LABELS, companyHomePath } from "@/types/roles";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ companyId: string }>;
}

export default async function CompanyAppLayout({ children, params }: LayoutProps) {
  const { companyId: routeCompanyId } = await params;
  const { ctx, companyId, role } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();
  const { data: company } = await supabase
    .from("companies")
    .select("name, status")
    .eq("id", companyId)
    .maybeSingle();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link
            href={companyHomePath(companyId)}
            className="flex items-center gap-2 font-semibold tracking-tight"
          >
            NeoBreed-ERP
          </Link>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">
              Aktif firma:{" "}
              <span className="font-medium text-foreground">
                {company?.name ?? "—"}
              </span>
            </span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
              {COMPANY_ROLE_BADGE_LABELS[role]}
            </span>
            <span className="text-muted-foreground">{ctx.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1">
        <aside className="hidden w-56 shrink-0 border-r border-border md:block">
          <CompanySidebar companyId={companyId} />
        </aside>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
