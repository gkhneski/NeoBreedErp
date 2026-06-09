"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Input } from "@/components/ui/input";

export function MaterialsSearchInput() {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const q = params.get("q") ?? "";

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    const url = new URL(window.location.href);
    if (value) {
      url.searchParams.set("q", value);
    } else {
      url.searchParams.delete("q");
    }
    startTransition(() => {
      router.replace(url.pathname + url.search);
    });
  }

  return (
    <Input
      type="search"
      defaultValue={q}
      onChange={handleChange}
      placeholder="Kod veya ad ile ara…"
      className="max-w-sm"
    />
  );
}
