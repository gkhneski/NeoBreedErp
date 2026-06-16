import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireModuleAccess } from "@/lib/auth";
import { reconcilePendingBatches } from "@/lib/marketplaces/discount-engine";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import {
  MARKETPLACE_APPROVE_ROLES,
  MARKETPLACE_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

import { ApprovalQueue, type PendingEventRow } from "./approval-queue";
import { CosmoMarketingPanel } from "./cosmo-marketing-panel";
import { CosmoPanel } from "./cosmo-panel";
import { DetectionButton } from "./detection-button";
import { DiscountLadder, type Tier } from "./discount-ladder";
import { ListingsTable, type ListingRow } from "./listings-table";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function MarketplacePage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireModuleAccess(
    routeCompanyId,
    "marketplace",
  );

  const service = createServiceRoleClient();
  await reconcilePendingBatches(service, companyId);

  const supabase = await createServerSupabaseClient();

  const { data: connection } = await service
    .from("marketplace_connections")
    .select("enabled, last_verified_at")
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .maybeSingle();

  const [{ data: pendingEvents }, { data: listings }, { data: tierRows }] =
    await Promise.all([
    supabase
      .from("marketplace_price_events")
      .select(
        "id, kind, old_price, new_price, trigger_expiry_date, trigger_days_left, created_at, " +
          "listing:listing_id(barcode, title, materials:material_id(code, name))",
      )
      .eq("company_id", companyId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .returns<PendingEventRow[]>(),
    supabase
      .from("marketplace_listings")
      .select(
        "id, barcode, stock_code, title, normal_sale_price, normal_list_price, " +
          "discount_price, discount_threshold_days, sync_stock, current_price_state, " +
          "applied_sale_price, sync_status, sync_error, last_synced_at, material_id, " +
          "materials:material_id(code, name, base_uom)",
      )
      .eq("company_id", companyId)
      .eq("channel", "trendyol")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .returns<Array<Omit<ListingRow, "sellable_quantity">>>(),
    supabase
      .from("marketplace_discount_tiers")
      .select("max_days_left, discount_percent")
      .eq("company_id", companyId)
      .order("max_days_left", { ascending: true })
      .returns<Tier[]>(),
  ]);

  const listingRows = listings ?? [];
  const materialIds = Array.from(
    new Set(listingRows.map((l) => l.material_id)),
  );
  const sellableByMaterial = new Map<string, number>();
  if (materialIds.length > 0) {
    const { data: lots } = await supabase
      .from("material_lots")
      .select("material_id, quantity_on_hand")
      .eq("company_id", companyId)
      .in("material_id", materialIds)
      .eq("status", "released")
      .is("owner_customer_id", null)
      .is("deleted_at", null)
      .gt("quantity_on_hand", 0);
    for (const lot of lots ?? []) {
      sellableByMaterial.set(
        lot.material_id,
        (sellableByMaterial.get(lot.material_id) ?? 0) +
          Number(lot.quantity_on_hand),
      );
    }
  }

  const tableRows: ListingRow[] = listingRows.map((l) => ({
    ...l,
    sellable_quantity: sellableByMaterial.get(l.material_id) ?? 0,
  }));

  const tiers: Tier[] = (tierRows ?? []).map((t) => ({
    max_days_left: Number(t.max_days_left),
    discount_percent: Number(t.discount_percent),
  }));
  const canManage = canWriteCompanyData(role, MARKETPLACE_WRITE_ROLES);
  const canApprove = canWriteCompanyData(role, MARKETPLACE_APPROVE_ROLES);
  const isAdmin = role === "company_admin";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Pazaryeri</h1>
          <p className="text-sm text-muted-foreground">
            Trendyol listingleri: fiyat/stok senkronu ve SKT yaklaşan ürünler
            için onaylı indirim otomasyonu.
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <DetectionButton companyId={companyId} />
            <Link href={companyModulePath(companyId, "marketplace", "import")}>
              <Button variant="outline">Trendyol&apos;dan Listeleri Çek</Button>
            </Link>
            <Link href={companyModulePath(companyId, "marketplace", "publish")}>
              <Button>Trendyol&apos;a Ürün Yayınla</Button>
            </Link>
          </div>
        ) : null}
      </header>

      {!connection ? (
        <EmptyState
          title="Trendyol bağlantısı yok"
          description={
            isAdmin
              ? "Önce Ayarlar → Pazaryeri Bağlantıları'ndan Trendyol API bilgilerini girin."
              : "Firma admininin Ayarlar → Pazaryeri Bağlantıları'ndan Trendyol API bilgilerini girmesi gerekiyor."
          }
        />
      ) : (
        <>
          {!connection.enabled ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              Trendyol bağlantısı devre dışı. Öneriler oluşturulur ama
              gönderim yapılamaz.
            </p>
          ) : null}

          <CosmoPanel companyId={companyId} canApprove={canApprove} />

          <CosmoMarketingPanel companyId={companyId} canApprove={canApprove} />

          <DiscountLadder
            companyId={companyId}
            tiers={tiers}
            canManage={canManage}
          />

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Bekleyen Fiyat Onayları</h2>
              {(pendingEvents ?? []).length > 0 ? (
                <Badge variant="warning">{(pendingEvents ?? []).length}</Badge>
              ) : null}
            </div>
            <ApprovalQueue
              companyId={companyId}
              events={pendingEvents ?? []}
              canApprove={canApprove}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">
              Listingler ({tableRows.length})
            </h2>
            {tableRows.length === 0 ? (
              <EmptyState
                title="Henüz eşleştirilmiş listing yok"
                description="Trendyol'dan Listeleri Çek ile mağazanızdaki ürünleri ERP ürünleriyle eşleştirin."
              />
            ) : (
              <ListingsTable
                companyId={companyId}
                rows={tableRows}
                canManage={canManage}
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
