import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

export type SalesDepot = { id: string; code: string; name: string };

// Satış deposu (LTD) = varsayılan olmayan depo. Ana Depo (is_default) fabrikadır.
export async function findSalesDepot(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<SalesDepot | null> {
  const { data } = await supabase
    .from("locations")
    .select("id, code, name")
    .eq("company_id", companyId)
    .eq("kind", "depot")
    .eq("is_default", false)
    .is("deleted_at", null)
    .order("code")
    .limit(1)
    .maybeSingle<SalesDepot>();
  return data ?? null;
}
