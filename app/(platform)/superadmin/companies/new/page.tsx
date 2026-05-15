import { requirePlatformAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { CompanyForm } from "./company-form";

export default async function NewCompanyPage() {
  await requirePlatformAdmin();
  const supabase = await createServerSupabaseClient();
  const { data: packages } = await supabase
    .from("packages")
    .select("id, name")
    .order("name");

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Firma Ekle</h1>
        <p className="text-sm text-muted-foreground">
          Yeni bir kiracı oluşturun. Firma Admini ayrı bir adımda davet edilir
          (Phase 5 sonrası).
        </p>
      </header>

      <CompanyForm packages={packages ?? []} />
    </div>
  );
}
