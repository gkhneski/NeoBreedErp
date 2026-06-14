import { Suspense } from "react";

import { MobileNav } from "@/components/layout/mobile-nav";
import { PlatformSidebar } from "@/components/layout/platform-sidebar";
import { FlashToast } from "@/components/ui/flash-toast";
import { requirePlatformAdmin } from "@/lib/auth";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requirePlatformAdmin();

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 md:block">
        <PlatformSidebar email={ctx.email ?? ""} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-1 w-full bg-destructive" aria-hidden title="Platform modu" />
        <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 md:px-6">
            <MobileNav>
              <PlatformSidebar email={ctx.email ?? ""} />
            </MobileNav>
            <span className="text-sm font-semibold">Platform Yönetimi</span>
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
