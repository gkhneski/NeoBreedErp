"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import {
  cosmoKeyConfigured,
  generateCosmoCopy,
  type CosmoLead,
} from "@/lib/marketplaces/cosmo";
import { runDiscountDetection } from "@/lib/marketplaces/discount-engine";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import {
  MARKETPLACE_APPROVE_ROLES,
  MARKETPLACE_WRITE_ROLES,
  companyModulePath,
} from "@/types/roles";

import { approvePriceEvent } from "./actions";

export type CosmoOpportunity = {
  eventId: string;
  productName: string;
  barcode: string;
  imageUrl: string | null;
  daysLeft: number | null;
  expiryDate: string | null;
  oldPrice: number;
  newPrice: number;
  percent: number;
  headline: string;
  pitch: string;
};

export type CosmoScanResult =
  | { ok: true; opportunities: CosmoOpportunity[]; aiPowered: boolean }
  | { ok: false; error: string };

type EventRow = {
  id: string;
  old_price: number | null;
  new_price: number;
  trigger_days_left: number | null;
  trigger_expiry_date: string | null;
  listing: {
    barcode: string;
    title: string | null;
    normal_sale_price: number;
    materials: { name: string } | null;
  } | null;
};

async function loadPendingDiscounts(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  companyId: string,
): Promise<EventRow[]> {
  const { data } = await supabase
    .from("marketplace_price_events")
    .select(
      "id, old_price, new_price, trigger_days_left, trigger_expiry_date, " +
        "listing:listing_id(barcode, title, normal_sale_price, " +
        "materials:material_id(name))",
    )
    .eq("company_id", companyId)
    .eq("status", "pending")
    .eq("kind", "discount")
    .order("trigger_days_left", { ascending: true, nullsFirst: false })
    .returns<EventRow[]>();
  return data ?? [];
}

// COSMO finds the SKT-driven discount opportunities, prices them off the ladder,
// and writes a pitch + campaign copy for each so they can be published in one tap.
export async function cosmoScan(companyIdInput: string): Promise<CosmoScanResult> {
  if (!z.string().uuid().safeParse(companyIdInput).success) {
    return { ok: false, error: "Geçersiz istek." };
  }
  const { companyId } = await requireCompanyRole(
    companyIdInput,
    MARKETPLACE_WRITE_ROLES,
  );

  const service = createServiceRoleClient();
  await runDiscountDetection(service, companyId);

  const supabase = await createServerSupabaseClient();
  const rows = await loadPendingDiscounts(supabase, companyId);

  const barcodes = Array.from(
    new Set(rows.map((r) => r.listing?.barcode).filter(Boolean) as string[]),
  );
  const imageByBarcode = new Map<string, string | null>();
  if (barcodes.length > 0) {
    const { data: remotes } = await supabase
      .from("marketplace_remote_products")
      .select("barcode, image_url")
      .eq("company_id", companyId)
      .in("barcode", barcodes);
    for (const r of remotes ?? []) imageByBarcode.set(r.barcode, r.image_url);
  }

  const leads: CosmoLead[] = rows.map((r) => {
    const normal = Number(r.listing?.normal_sale_price ?? r.old_price ?? 0);
    const newPrice = Number(r.new_price);
    const percent =
      normal > 0 ? Math.round((1 - newPrice / normal) * 100) : 0;
    return {
      eventId: r.id,
      productName:
        r.listing?.materials?.name ?? r.listing?.title ?? r.listing?.barcode ?? "Ürün",
      daysLeft: r.trigger_days_left,
      expiryDate: r.trigger_expiry_date,
      oldPrice: normal,
      newPrice,
      percent,
    };
  });

  const copy = await generateCosmoCopy(leads);

  const opportunities: CosmoOpportunity[] = leads.map((l, i) => {
    const c = copy.get(l.eventId)!;
    return {
      eventId: l.eventId,
      productName: l.productName,
      barcode: rows[i].listing?.barcode ?? "",
      imageUrl: imageByBarcode.get(rows[i].listing?.barcode ?? "") ?? null,
      daysLeft: l.daysLeft,
      expiryDate: l.expiryDate,
      oldPrice: l.oldPrice,
      newPrice: l.newPrice,
      percent: l.percent,
      headline: c.headline,
      pitch: c.pitch,
    };
  });

  return { ok: true, opportunities, aiPowered: cosmoKeyConfigured() };
}

export type CosmoAutopilotResult =
  | { ok: true; applied: number; failed: number }
  | { ok: false; error: string };

// "İzin verdiysen kendisi yapsın": approve + publish every pending discount.
export async function cosmoAutopilot(
  companyIdInput: string,
): Promise<CosmoAutopilotResult> {
  if (!z.string().uuid().safeParse(companyIdInput).success) {
    return { ok: false, error: "Geçersiz istek." };
  }
  const { companyId } = await requireCompanyRole(
    companyIdInput,
    MARKETPLACE_APPROVE_ROLES,
  );

  const service = createServiceRoleClient();
  await runDiscountDetection(service, companyId);

  const supabase = await createServerSupabaseClient();
  const rows = await loadPendingDiscounts(supabase, companyId);

  let applied = 0;
  let failed = 0;
  for (const row of rows) {
    const res = await approvePriceEvent(companyId, row.id);
    if (res.ok) applied += 1;
    else failed += 1;
  }

  revalidatePath(companyModulePath(companyId, "marketplace"));
  return { ok: true, applied, failed };
}
