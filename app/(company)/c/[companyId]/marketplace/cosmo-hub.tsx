"use client";

import { Bot, Megaphone, Tag } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { CosmoMarketingPanel } from "./cosmo-marketing-panel";
import { CosmoPanel } from "./cosmo-panel";

type Tab = "deals" | "marketing";

export function CosmoHub({
  companyId,
  canApprove,
}: {
  companyId: string;
  canApprove: boolean;
}) {
  const [tab, setTab] = useState<Tab>("deals");

  const tabs: Array<{ key: Tab; label: string; icon: typeof Tag }> = [
    { key: "deals", label: "SKT Fırsatları", icon: Tag },
    { key: "marketing", label: "Pazarlama & Görünürlük", icon: Megaphone },
  ];

  return (
    <section className="overflow-hidden rounded-3xl border border-violet-500/30 bg-gradient-to-br from-emerald-50 via-card to-violet-50 shadow-[0_2px_16px_-8px_rgba(99,102,241,0.4)] dark:from-emerald-950/30 dark:via-card dark:to-violet-950/20">
      <div className="flex items-center gap-3 p-4 sm:p-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-violet-600 text-white shadow-sm">
          <Bot className="h-6 w-6" />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold tracking-tight">COSMO</h2>
            <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-400">
              Pazaryeri AI ajanı
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            SKT indirimleri, fiyat, içerik, aramada görünürlük ve canlı rakip
            analizi — tek yerde.
          </p>
        </div>
      </div>

      <div className="flex gap-1 px-4 sm:px-5">
        {tabs.map((t) => {
          const active = tab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-t-xl border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-violet-600 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="border-t border-border p-4 sm:p-5">
        {tab === "deals" ? (
          <CosmoPanel companyId={companyId} canApprove={canApprove} />
        ) : (
          <CosmoMarketingPanel companyId={companyId} canApprove={canApprove} />
        )}
      </div>
    </section>
  );
}
