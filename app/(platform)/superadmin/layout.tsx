import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { PlatformSidebar } from "@/components/layout/platform-sidebar";
import { requirePlatformAdmin } from "@/lib/auth";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requirePlatformAdmin();

  return (
    <div className="min-h-screen flex flex-col">
      <div
        className="h-1 w-full bg-destructive"
        aria-hidden
        title="Platform modu"
      />
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link
            href="/superadmin"
            className="flex items-center gap-2 font-semibold tracking-tight"
          >
            NeoBreed-ERP
            <span className="text-muted-foreground">· Platform</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {ctx.email}
            </span>
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-destructive">
              Süper Admin
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1">
        <aside className="hidden w-56 shrink-0 border-r border-border md:block">
          <PlatformSidebar />
        </aside>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
