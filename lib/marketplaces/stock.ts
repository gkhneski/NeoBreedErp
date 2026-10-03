import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

// Satilabilir stok: SATIS DEPOSUNDAKI (LTD) serbest, musteri mali olmayan lotlar
// (sellable_lots gorunumu). Fabrikadaki, karantina/bloklu ve fason stok satilmaz.
export async function getSellableQuantity(
  supabase: SupabaseClient<Database>,
  companyId: string,
  materialId: string,
): Promise<number> {
  const { data } = await supabase
    .from("sellable_lots")
    .select("quantity_on_hand")
    .eq("company_id", companyId)
    .eq("material_id", materialId)
    .is("owner_customer_id", null);

  return (data ?? []).reduce(
    (sum, row) => sum + Number(row.quantity_on_hand),
    0,
  );
}
