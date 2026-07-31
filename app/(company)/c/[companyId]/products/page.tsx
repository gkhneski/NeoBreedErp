import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireModuleAccess } from "@/lib/auth";
import { getExpiryThresholds } from "@/lib/company-settings";
import {
  EXPIRY_BADGE_CLASS,
  EXPIRY_LABEL,
  daysUntil,
  expiryUrgency,
} from "@/lib/expiry";
import {
  SIGNED_URL_TTL_SECONDS,
  TENANT_FILES_BUCKET,
} from "@/lib/storage/attachments";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uomLabel } from "@/lib/uom";
import {
  MASTER_DATA_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

import { deleteMaterial } from "../materials/actions";
import { PullAllImagesButton } from "./trendyol-image-buttons";

interface PageProps {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ view?: string }>;
}

type Lot = {
  quantity_on_hand: number;
  status: "quarantine" | "released" | "blocked";
  expiry_date: string | null;
  deleted_at: string | null;
  locations: { is_default: boolean } | null;
};

type ProductRow = {
  id: string;
  code: string;
  name: string;
  base_uom: string;
  barcode: string | null;
  fason_customer_id: string | null;
  fason_customer: { code: string; name: string } | null;
  material_lots: Lot[] | null;
};

type ListingRow = {
  material_id: string;
  normal_sale_price: number;
  applied_sale_price: number | null;
  current_price_state: "normal" | "discounted" | "unknown";
};

function fmt(n: number): string {
  return Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 6 });
}
function money(n: number): string {
  return `${Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ₺`;
}

export default async function ProductsPage({ params, searchParams }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { view } = await searchParams;
  const isFasonView = view === "fason";
  const { companyId, role } = await requireModuleAccess(routeCompanyId, "products");
  const supabase = await createServerSupabaseClient();
  const canWrite = canWriteCompanyData(role, MASTER_DATA_WRITE_ROLES);
  const thresholds = await getExpiryThresholds(companyId);

  const { data: products } = await supabase
    .from("materials")
    .select(
      "id, code, name, base_uom, barcode, fason_customer_id, " +
        "fason_customer:fason_customer_id(code, name), " +
        "material_lots(quantity_on_hand, status, expiry_date, deleted_at, " +
        "locations:location_id(is_default))",
    )
    .eq("company_id", companyId)
    .eq("type", "finished")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .returns<ProductRow[]>();

  const allRows = products ?? [];
  const ownRows = allRows.filter((r) => r.fason_customer_id === null);
  const fasonRows = allRows.filter((r) => r.fason_customer_id !== null);
  const rows = isFasonView ? fasonRows : ownRows;
  const newHref = companyModulePath(companyId, "products", "new");
  const listHref = companyModulePath(companyId, "products");

  // Thumbnails (uploaded) — fall back to the Trendyol catalog image by barcode.
  const thumbnailPaths = rows.map((r) => `${companyId}/products/${r.id}/thumbnail`);
  const { data: signedThumbnails } =
    thumbnailPaths.length > 0
      ? await supabase.storage
          .from(TENANT_FILES_BUCKET)
          .createSignedUrls(thumbnailPaths, SIGNED_URL_TTL_SECONDS)
      : { data: [] };
  const thumbnailByPath = new Map<string, string>();
  for (const entry of signedThumbnails ?? []) {
    if (entry?.path && entry.signedUrl) thumbnailByPath.set(entry.path, entry.signedUrl);
  }

  const barcodes = Array.from(
    new Set(rows.map((r) => r.barcode).filter(Boolean) as string[]),
  );
  const remoteImageByBarcode = new Map<string, string | null>();
  if (barcodes.length > 0) {
    const { data: remotes } = await supabase
      .from("marketplace_remote_products")
      .select("barcode, image_url")
      .eq("company_id", companyId)
      .eq("channel", "trendyol")
      .in("barcode", barcodes);
    for (const r of remotes ?? []) remoteImageByBarcode.set(r.barcode, r.image_url);
  }

  const { data: listingRows } = await supabase
    .from("marketplace_listings")
    .select("material_id, normal_sale_price, applied_sale_price, current_price_state")
    .eq("company_id", companyId)
    .eq("channel", "trendyol")
    .is("deleted_at", null)
    .returns<ListingRow[]>();
  const listingByMaterial = new Map(
    (listingRows ?? []).map((l) => [l.material_id, l]),
  );

  const marketplaceHref = companyModulePath(companyId, "marketplace");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Ürünler</h1>
          <p className="text-sm text-muted-foreground">
            Stok, fabrika ve pazaryeri tek yerde. Ürüne tıklayınca tüm detay açılır.
          </p>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            <PullAllImagesButton companyId={companyId} />
            <Link href={newHref}>
              <Button>Yeni Ürün</Button>
            </Link>
          </div>
        ) : null}
      </header>

      <div className="flex gap-1 rounded-lg border border-border bg-secondary/40 p-1 w-fit">
        <Link
          href={listHref}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            !isFasonView
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Kendi Ürünlerimiz ({ownRows.length})
        </Link>
        <Link
          href={`${listHref}?view=fason`}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            isFasonView
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Fason ({fasonRows.length})
        </Link>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Görsel</th>
                <th className="px-3 py-2 text-left font-medium">Ürün</th>
                <th className="px-3 py-2 text-right font-medium">Toplam</th>
                <th className="px-3 py-2 text-right font-medium">LTD</th>
                <th className="px-3 py-2 text-right font-medium">Ana Depo</th>
                <th className="px-3 py-2 text-left font-medium">SKT</th>
                <th className="px-3 py-2 text-left font-medium">
                  {isFasonView ? "Müşteri" : "Trendyol"}
                </th>
                {canWrite ? (
                  <th className="px-3 py-2 text-right font-medium">İşlem</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const lots = (row.material_lots ?? []).filter(
                  (l) => l.deleted_at === null,
                );
                const released = lots.filter((l) => l.status === "released");
                const total = released.reduce(
                  (s, l) => s + Number(l.quantity_on_hand),
                  0,
                );
                const ltd = released
                  .filter((l) => l.locations && l.locations.is_default === false)
                  .reduce((s, l) => s + Number(l.quantity_on_hand), 0);
                const ana = released
                  .filter((l) => l.locations && l.locations.is_default === true)
                  .reduce((s, l) => s + Number(l.quantity_on_hand), 0);

                const nearestExpiry = released
                  .map((l) => l.expiry_date)
                  .filter((d): d is string => Boolean(d))
                  .sort()[0];
                const urgency = nearestExpiry
                  ? expiryUrgency(nearestExpiry, thresholds)
                  : null;

                const detailHref = companyModulePath(companyId, "products", row.id);
                const editHref = companyModulePath(
                  companyId,
                  "products",
                  row.id,
                  "edit",
                );
                const img =
                  thumbnailByPath.get(`${companyId}/products/${row.id}/thumbnail`) ??
                  (row.barcode ? remoteImageByBarcode.get(row.barcode) ?? null : null);
                const listing = listingByMaterial.get(row.id);
                const discounted =
                  listing &&
                  listing.applied_sale_price !== null &&
                  Number(listing.applied_sale_price) < Number(listing.normal_sale_price);

                const deleteAction = deleteMaterial.bind(
                  null,
                  companyId,
                  row.id,
                  companyModulePath(companyId, "products"),
                );

                return (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <Link
                        href={detailHref}
                        className="block h-12 w-12 overflow-hidden rounded-lg border border-border bg-secondary"
                      >
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={img}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={detailHref} className="hover:underline">
                        <span className="font-mono text-xs text-muted-foreground">
                          {row.code}
                        </span>{" "}
                        {row.name}
                      </Link>
                      {row.barcode ? (
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {row.barcode}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {fmt(total)}{" "}
                      <span className="text-muted-foreground">
                        {uomLabel(row.base_uom)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {ltd > 0 ? (
                        <Badge variant="outline">{fmt(ltd)}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                      {ana > 0 ? fmt(ana) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {nearestExpiry ? (
                        <div className="flex flex-col gap-1">
                          <span>{nearestExpiry}</span>
                          {urgency && urgency !== "ok" ? (
                            <span
                              className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${EXPIRY_BADGE_CLASS[urgency]}`}
                            >
                              {urgency === "expired"
                                ? EXPIRY_LABEL.expired
                                : `${EXPIRY_LABEL[urgency]} · ${daysUntil(nearestExpiry)}g`}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.fason_customer ? (
                        <Badge variant="outline">
                          {row.fason_customer.name}
                        </Badge>
                      ) : listing ? (
                        <Link
                          href={marketplaceHref}
                          className="inline-flex flex-col gap-0.5 hover:underline"
                        >
                          {discounted ? (
                            <Badge variant="warning">
                              İndirimde {money(Number(listing.applied_sale_price))}
                            </Badge>
                          ) : (
                            <Badge variant="default">
                              Listede {money(Number(listing.normal_sale_price))}
                            </Badge>
                          )}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Listede değil</span>
                      )}
                    </td>
                    {canWrite ? (
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Link href={editHref}>
                            <Button size="sm" variant="outline">
                              Düzenle
                            </Button>
                          </Link>
                          <form action={deleteAction}>
                            <Button size="sm" variant="destructive" type="submit">
                              Sil
                            </Button>
                          </form>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title={isFasonView ? "Henüz fason ürün yok" : "Henüz bitmiş ürün yok"}
          description={
            isFasonView
              ? "Yeni ürün eklerken 'Fason Müşterisi' seçerseniz ürün bu sekmede listelenir."
              : "Yeni ürün ekleyerek URN kodlu bitmiş ürün ve taslak reçete oluşturun."
          }
          action={
            canWrite ? (
              <Link href={newHref}>
                <Button>Ürün Ekle</Button>
              </Link>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
