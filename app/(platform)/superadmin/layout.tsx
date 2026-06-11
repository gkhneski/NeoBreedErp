import { Suspense } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
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
        <PlatformSidebar />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-1 w-full bg-destructive" aria-hidden title="Platform modu" />
        <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
          <div className="flex h-14 items-center justify-between gap-4 px-6">
            <span className="text-sm font-medium">Platform Yönetimi</span>
            <div className="flex items-center gap-3 text-xs">
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-destructive">
                Süper Admin
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
