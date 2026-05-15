"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";

import { setCompanyStatus } from "../actions";

interface StatusActionsProps {
  companyId: string;
  currentStatus: "active" | "suspended" | "archived";
}

export function StatusActions({ companyId, currentStatus }: StatusActionsProps) {
  const [pending, startTransition] = useTransition();

  function update(next: "active" | "suspended" | "archived") {
    startTransition(async () => {
      await setCompanyStatus(companyId, next);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant={currentStatus === "active" ? "default" : "outline"}
        disabled={pending || currentStatus === "active"}
        onClick={() => update("active")}
      >
        Aktif Yap
      </Button>
      <Button
        type="button"
        size="sm"
        variant={currentStatus === "suspended" ? "default" : "outline"}
        disabled={pending || currentStatus === "suspended"}
        onClick={() => update("suspended")}
      >
        Askıya Al
      </Button>
      <Button
        type="button"
        size="sm"
        variant={currentStatus === "archived" ? "default" : "outline"}
        disabled={pending || currentStatus === "archived"}
        onClick={() => update("archived")}
      >
        Arşivle
      </Button>
    </div>
  );
}
