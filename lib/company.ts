import "server-only";

import { cache } from "react";

import { createServerSupabaseClient } from "@/lib/supabase/server";

// cache(): layout ve page ayni request icinde ikisi de cagirir; sorgu
// render basina bir kez calisir.
export const getCompanySummary = cache(async (companyId: string) => {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("companies")
    .select("name, status")
    .eq("id", companyId)
    .maybeSingle();
  return data;
});
