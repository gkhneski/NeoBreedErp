import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

// Satilabilir stok: serbest, silinmemis, musteri mali olmayan lotlarin toplami.
// Karantina/bloklu/fason stok pazaryerinde asla satilmaz.
export async function getSellableQuantity(
  supabase: SupabaseClient<Database>,
  companyId: string,
  materialId: string,
): Promise<number> {
  const { data } = await supabase
    .from("material_lots")
    .select("quantity_on_hand")
    .eq("company_id", companyId)
    .eq("material_id", materialId)
    .eq("status", "released")
    .is("owner_customer_id", null)
    .is("deleted_at", null)
    .gt("quantity_on_hand", 0);

  return (data ?? []).reduce(
    (sum, row) => sum + Number(row.quantity_on_hand),
    0,
  );
}
