import { Leaf, LogOut } from "lucide-react";
import Link from "next/link";

import { signOut } from "@/app/login/actions";
import { FlashToast } from "@/components/ui/flash-toast";
import { requireBuyer } from "@/lib/auth";
import { getCompanySummary } from "@/lib/company";
import { portalHomePath } from "@/types/roles";

import { Suspense } from "react";

import { PortalNav } from "./portal-nav";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ companyId: string }>;
}

export default async function PortalLayout({ children, params }: LayoutProps) {
  const { companyId: routeCompanyId } = await params;
  const { ctx, companyId } = await requireBuyer(routeCompanyId);
  const company = await getCompanySummary(companyId);
  const home = portalHomePath(companyId);

  return (
    <div className="flex min-h-screen flex-col bg-secondary/20">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href={home} className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <Leaf className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">{company?.name ?? "Firma"}</p>
              <p className="text-[11px] text-muted-foreground">Sipariş Portalı</p>
            </div>
          </Link>

          <PortalNav companyId={companyId} />

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {ctx.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
              >
                <LogOut className="h-3.5 w-3.5" />
                Çıkış
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 sm:px-6 sm:py-6">
        {children}
      </main>

      <Suspense fallback={null}>
        <FlashToast />
      </Suspense>
    </div>
  );
}
