import "server-only";

import { cache } from "react";

import {
  DEFAULT_EXPIRY_THRESHOLDS,
  type ExpiryThresholds,
} from "@/lib/expiry";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const getExpiryThresholds = cache(
  async (companyId: string): Promise<ExpiryThresholds> => {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from("company_settings")
      .select("expiry_critical_days, expiry_warning_days")
      .eq("company_id", companyId)
      .maybeSingle();

    if (!data) return DEFAULT_EXPIRY_THRESHOLDS;
    return {
      criticalDays: data.expiry_critical_days,
      warningDays: data.expiry_warning_days,
    };
  },
);
