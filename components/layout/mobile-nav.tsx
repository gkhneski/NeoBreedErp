"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function MobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Menüyü aç"
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border transition-colors hover:bg-secondary"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {mounted && open
        ? createPortal(
            <div className="fixed inset-0 z-[60] md:hidden">
              <div
                className="absolute inset-0 bg-black/50 animate-in fade-in duration-150"
                onClick={() => setOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute inset-y-0 left-0 w-64 max-w-[85vw] shadow-xl animate-in slide-in-from-left duration-200">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Menüyü kapat"
                  className="absolute right-3 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-active hover:text-white"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
                <div className="h-full">{children}</div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
