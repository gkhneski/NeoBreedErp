"use client";

import { useEffect, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";

function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/")) return "/welcome";
  return value;
}

export default function AuthAcceptPage() {
  const [message, setMessage] = useState("Davet bağlantısı doğrulanıyor...");

  useEffect(() => {
    let cancelled = false;

    async function accept() {
      const supabase = createBrowserSupabaseClient();
      const url = new URL(window.location.href);
      const next = safeNext(url.searchParams.get("next"));
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          if (!cancelled) setMessage("Davet bağlantısı doğrulanamadı.");
          return;
        }
      } else {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          if (!cancelled) setMessage("Davet bağlantısı geçersiz veya süresi dolmuş.");
          return;
        }
      }

      window.location.replace(next);
    }

    void accept();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-6 py-12">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          NeoBreed-ERP
        </h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </main>
  );
}
