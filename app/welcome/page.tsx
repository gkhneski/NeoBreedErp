import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ROUTE_LOGIN } from "@/types/roles";

import { WelcomeForm } from "./welcome-form";

export default async function WelcomePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`${ROUTE_LOGIN}?reason=session_expired`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Hoş geldiniz
        </h1>
        <p className="text-sm text-muted-foreground">
          Hesabınızı etkinleştirmek için bir şifre belirleyin. Şifre belirlendikten
          sonra firma çalışma alanınıza yönlendirileceksiniz.
        </p>
      </div>

      <WelcomeForm
        email={user.email ?? ""}
        defaultFullName={profile?.full_name ?? null}
      />
    </main>
  );
}
