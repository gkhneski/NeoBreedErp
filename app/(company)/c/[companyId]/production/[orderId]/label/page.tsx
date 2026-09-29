import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { EmptyState } from "@/components/ui/empty-state";
import { requireModuleAccess } from "@/lib/auth";
import { getCompanySummary } from "@/lib/company";
import {
  contentBlock,
  type ContentBlock,
  type ContentRecipe,
} from "@/lib/production/batch-card";
import {
  parsePack,
  targetDisplay,
  unitLabelForDisplay,
  yieldUnitLabel,
} from "@/lib/production/pack";
import {
  SIGNED_URL_TTL_SECONDS,
  TENANT_FILES_BUCKET,
} from "@/lib/storage/attachments";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { convertQuantity } from "@/lib/uom";
import { companyModulePath } from "@/types/roles";

import { FitToPage } from "./fit-to-page";
import { PrintButton } from "./print-button";

interface PageProps {
  params: Promise<{ companyId: string; orderId: string }>;
  searchParams: Promise<{ batch?: string }>;
}

type MaterialType = "raw" | "semi" | "finished";

type CardOrder = {
  id: string;
  code: string;
  planned_uom: string;
  finished_material_id: string;
  recipe_id: string;
  materials: {
    code: string;
    name: string;
    barcode: string | null;
    type: MaterialType;
  } | null;
  recipes: {
    code: string;
    version: number;
    yield_quantity: number;
    yield_uom: string;
  } | null;
  customers: { name: string } | null;
};

type CardBatch = {
  id: string;
  batch_number: string;
  actual_quantity: number | null;
  planned_quantity: number;
  uom: string;
  completed_at: string | null;
  output_lot_id: string;
  material_lots: {
    id: string;
    lot_number: string;
    expiry_date: string | null;
  } | null;
};

type OrderRecipeItem = {
  material_id: string;
  position: number;
  quantity: number;
  uom: string;
  active: boolean;
  materials: {
    code: string;
    name: string;
    type: MaterialType;
    base_uom: string;
  } | null;
};

type ConsumedRow = {
  id: string;
  quantity: number;
  material_id: string;
  lot_id: string;
  materials: {
    code: string;
    name: string;
    type: MaterialType;
    base_uom: string;
  } | null;
  material_lots: { lot_number: string } | null;
};

type SemiSource = {
  batch_number: string;
  recipe_id: string;
  output_lot_id: string;
};

type FormulaRecipe = ContentRecipe & {
  id: string;
  finished_material_id: string;
};

// A4'e tek sayfa basılır: uygulama çerçevesi gizlenir, yalnızca kart kalır.
const PRINT_CSS = `
@page { size: A4; margin: 0; }
@media print {
  html, body { background: #fff !important; }
  body * { visibility: hidden; }
  aside, header { display: none !important; }
  #batch-card, #batch-card * { visibility: visible; }
  #batch-card {
    position: absolute;
    left: 0;
    top: 0;
    height: 296mm;
    margin: 0;
    border: 0;
    box-shadow: none;
  }
}
`;

const ISTANBUL = "Europe/Istanbul";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("tr-TR", { timeZone: ISTANBUL });
}

function formatNumber(n: number): string {
  return Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 3 });
}

// Uzun numaralar tek satıra sığsın diye punto kısalır.
function codeSize(value: string): string {
  if (value.length <= 14) return "text-[19pt]";
  if (value.length <= 22) return "text-[14pt]";
  return "text-[11pt]";
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-l-2 border-emerald-700 pl-[2.5mm]">
      <p className="text-[7.5pt] font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <p className="text-[11pt] font-semibold leading-tight">{value}</p>
    </div>
  );
}

export default async function BatchCardPage({ params, searchParams }: PageProps) {
  const { companyId: routeCompanyId, orderId } = await params;
  const { batch: requestedBatchId } = await searchParams;
  const { companyId } = await requireModuleAccess(routeCompanyId, "production");
  const supabase = await createServerSupabaseClient();

  const { data: order } = await supabase
    .from("production_orders")
    .select(
      "id, code, planned_uom, finished_material_id, recipe_id, " +
        "materials:finished_material_id(code, name, barcode, type), " +
        "recipes:recipe_id(code, version, yield_quantity, yield_uom), " +
        "customers:customer_id(name)",
    )
    .eq("id", orderId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle<CardOrder>();

  if (!order || !order.materials) notFound();

  const orderHref = companyModulePath(companyId, "production", order.id);

  const [{ data: batchRows }, { data: itemRows }, company] = await Promise.all([
    supabase
      .from("production_batches")
      .select(
        "id, batch_number, actual_quantity, planned_quantity, uom, completed_at, " +
          "output_lot_id, material_lots:output_lot_id(id, lot_number, expiry_date)",
      )
      .eq("company_id", companyId)
      .eq("production_order_id", order.id)
      .in("status", ["completed", "closed"])
      .not("output_lot_id", "is", null)
      .is("deleted_at", null)
      .order("completed_at", { ascending: false })
      .returns<CardBatch[]>(),
    supabase
      .from("recipe_items")
      .select(
        "material_id, position, quantity, uom, active, " +
          "materials:material_id(code, name, type, base_uom)",
      )
      .eq("recipe_id", order.recipe_id)
      .order("position", { ascending: true })
      .returns<OrderRecipeItem[]>(),
    getCompanySummary(companyId),
  ]);

  const batches = batchRows ?? [];
  const batch =
    batches.find((b) => b.id === requestedBatchId) ?? batches[0] ?? null;

  if (!batch || !batch.material_lots) {
    return (
      <div className="space-y-4">
        <Link
          href={orderHref}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← {order.code}
        </Link>
        <EmptyState
          title="Parti kartı henüz hazır değil"
          description="Parti kartı, parti tamamlanıp çıkış lotu oluştuktan sonra üretilir."
        />
      </div>
    );
  }

  const product = order.materials;
  const lot = batch.material_lots;
  const recipeItems = itemRows ?? [];
  const isFinished = product.type === "finished";

  const { data: consumedRows } = await supabase
    .from("cost_snapshots")
    .select(
      "id, quantity, material_id, lot_id, " +
        "materials:material_id(code, name, type, base_uom), " +
        "material_lots:lot_id(lot_number)",
    )
    .eq("company_id", companyId)
    .eq("production_batch_id", batch.id)
    .order("created_at", { ascending: true })
    .returns<ConsumedRow[]>();
  const consumed = consumedRows ?? [];

  // İçerik: mamülde, tüketilen YM lotunu üreten partinin reçetesi (yoksa YM'nin
  // yayındaki reçetesi); yarı mamülde emrin kendi reçetesi.
  const semiItems = recipeItems.filter(
    (i) => i.active && i.materials?.type === "semi",
  );
  const semiLotIds = consumed
    .filter((c) => c.materials?.type === "semi")
    .map((c) => c.lot_id);

  let semiSources: SemiSource[] = [];
  if (isFinished && semiLotIds.length > 0) {
    const { data } = await supabase
      .from("production_batches")
      .select("batch_number, recipe_id, output_lot_id")
      .eq("company_id", companyId)
      .in("output_lot_id", semiLotIds)
      .is("deleted_at", null)
      .returns<SemiSource[]>();
    semiSources = data ?? [];
  }

  const formulaRecipeIds = new Set<string>(
    isFinished ? semiSources.map((s) => s.recipe_id) : [order.recipe_id],
  );
  const formulaSelect =
    "id, finished_material_id, yield_quantity, yield_uom, " +
    "recipe_items(position, quantity, uom, active, materials:material_id(code, name))";

  let formulaRecipes: FormulaRecipe[] = [];
  if (formulaRecipeIds.size > 0) {
    const { data } = await supabase
      .from("recipes")
      .select(formulaSelect)
      .eq("company_id", companyId)
      .in("id", [...formulaRecipeIds])
      .returns<FormulaRecipe[]>();
    formulaRecipes = data ?? [];
  }

  const uncovered = isFinished
    ? semiItems
        .map((i) => i.material_id)
        .filter((id) => !formulaRecipes.some((r) => r.finished_material_id === id))
    : [];
  if (uncovered.length > 0) {
    const { data } = await supabase
      .from("recipes")
      .select(formulaSelect)
      .eq("company_id", companyId)
      .eq("status", "published")
      .in("finished_material_id", uncovered)
      .is("deleted_at", null)
      .order("version", { ascending: false })
      .returns<FormulaRecipe[]>();
    for (const r of data ?? []) {
      if (!formulaRecipes.some((f) => f.finished_material_id === r.finished_material_id)) {
        formulaRecipes.push(r);
      }
    }
  }

  const recipeYield = order.recipes
    ? { yield_quantity: order.recipes.yield_quantity, recipe_items: recipeItems }
    : null;
  const unit = yieldUnitLabel(order.planned_uom, product.name, recipeYield);
  const pack = parsePack(product.name);
  const quantity = Number(batch.actual_quantity ?? batch.planned_quantity);
  const quantityDisplay = targetDisplay(
    quantity,
    order.planned_uom,
    product.name,
    recipeYield,
  );

  const contents: ContentBlock[] = [];
  if (isFinished) {
    for (const item of semiItems) {
      const recipe = formulaRecipes.find(
        (r) => r.finished_material_id === item.material_id,
      );
      const recipeYieldQty = Number(recipe?.yield_quantity ?? 0);
      const orderYieldQty = Number(order.recipes?.yield_quantity ?? 0);
      if (!recipe || !(recipeYieldQty > 0)) continue;

      if (recipe.yield_uom === "unit") {
        contents.push(
          contentBlock(recipe, `1 ${pack.form ?? "adet"}`, 1 / recipeYieldQty),
        );
        continue;
      }
      const semiPerYield = convertQuantity(
        Number(item.quantity),
        item.uom,
        recipe.yield_uom,
      );
      if (semiPerYield !== null && orderYieldQty > 0) {
        contents.push(
          contentBlock(
            recipe,
            `1 ${unit}`,
            semiPerYield / orderYieldQty / recipeYieldQty,
          ),
        );
      }
    }
  } else {
    const recipe = formulaRecipes[0];
    const recipeYieldQty = Number(recipe?.yield_quantity ?? 0);
    if (recipe && recipeYieldQty > 0) {
      contents.push(
        contentBlock(
          recipe,
          `1 ${unitLabelForDisplay(recipe.yield_uom)}`,
          1 / recipeYieldQty,
        ),
      );
    }
  }

  // Tüketim lotun biriminde girilir; reçete birimi lot birimine çevrilemiyorsa
  // (ör. adet ↔ g) reçete birimi geçerlidir.
  const consumedUom = (row: ConsumedRow) => {
    const item = recipeItems.find((i) => i.material_id === row.material_id);
    const base = row.materials?.base_uom ?? item?.uom ?? "";
    if (!item) return base;
    return convertQuantity(1, item.uom, base) !== null ? base : item.uom;
  };

  let imageUrl: string | null = null;
  const { data: signedThumbnail } = await supabase.storage
    .from(TENANT_FILES_BUCKET)
    .createSignedUrl(
      `${companyId}/products/${order.finished_material_id}/thumbnail`,
      SIGNED_URL_TTL_SECONDS,
    );
  imageUrl = signedThumbnail?.signedUrl ?? null;
  if (!imageUrl && product.barcode) {
    const { data: remote } = await supabase
      .from("marketplace_remote_products")
      .select("image_url")
      .eq("company_id", companyId)
      .eq("channel", "trendyol")
      .eq("barcode", product.barcode)
      .maybeSingle<{ image_url: string | null }>();
    imageUrl = remote?.image_url ?? null;
  }

  const headerStore = await headers();
  const host = headerStore.get("host") ?? "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "https";
  const lotUrl = `${proto}://${host}/c/${companyId}/lots/${lot.id}`;
  const qrDataUrl = await QRCode.toDataURL(lotUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 480,
  });

  const semiBatchNumbers = [...new Set(semiSources.map((s) => s.batch_number))];

  return (
    <div className="space-y-4">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <FitToPage cardId="batch-card" bodyId="batch-card-body" />

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link
          href={orderHref}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← {order.code}
        </Link>
        <PrintButton fileName={`Parti Kartı ${lot.lot_number} - ${product.name}`} />
        {batches.length > 1
          ? batches.map((b) => (
              <Link
                key={b.id}
                href={`${companyModulePath(companyId, "production", order.id, "label")}?batch=${b.id}`}
                className={
                  "rounded-md border border-border px-2 py-1 font-mono text-xs " +
                  (b.id === batch.id ? "bg-secondary" : "hover:bg-secondary/50")
                }
              >
                {b.batch_number}
              </Link>
            ))
          : null}
      </div>

      <div className="overflow-x-auto print:overflow-visible">
        <div
          id="batch-card"
          className="mx-auto flex h-[297mm] w-[210mm] flex-col gap-[5mm] overflow-hidden border border-border bg-white p-[12mm] text-black shadow-sm"
          style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
        >
          <div className="flex items-end justify-between border-b-2 border-emerald-700 pb-[3mm]">
            <div>
              <p className="text-[13pt] font-bold leading-tight">
                {company?.name ?? ""}
              </p>
              <p className="text-[8.5pt] font-semibold uppercase tracking-[0.2em] text-emerald-800">
                Parti Kartı
              </p>
            </div>
            <p className="text-right text-[8.5pt] text-neutral-600">
              Üretim Emri{" "}
              <span className="font-mono font-semibold text-black">
                {order.code}
              </span>
              <br />
              Düzenlenme {formatDate(new Date().toISOString())}
            </p>
          </div>

          <div className="flex items-stretch gap-[6mm]">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt={product.name}
                className="h-[52mm] w-[52mm] shrink-0 border border-neutral-300 object-contain"
              />
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-[1.5mm]">
              <p className="text-[8pt] font-semibold uppercase tracking-wider text-neutral-500">
                {isFinished ? "Bitmiş Ürün" : "Yarı Mamül"}
              </p>
              <p className="text-[20pt] font-bold leading-[1.1]">
                {product.name}
              </p>
              <p className="text-[9.5pt] text-neutral-700">
                Ürün Kodu{" "}
                <span className="font-mono font-semibold">{product.code}</span>
                {product.barcode ? (
                  <>
                    {" · "}Barkod{" "}
                    <span className="font-mono font-semibold">
                      {product.barcode}
                    </span>
                  </>
                ) : null}
              </p>
              {order.recipes ? (
                <p className="text-[9.5pt] text-neutral-700">
                  Reçete{" "}
                  <span className="font-mono font-semibold">
                    {order.recipes.code}
                  </span>{" "}
                  v{order.recipes.version}
                </p>
              ) : null}
              {order.customers ? (
                <p className="mt-[1mm] w-fit border-2 border-black px-[2mm] py-[0.5mm] text-[9pt] font-bold uppercase">
                  Fason — {order.customers.name}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt={`${lot.lot_number} lot QR kodu`}
                className="h-[44mm] w-[44mm]"
              />
              <p className="text-[7.5pt] text-neutral-600">
                Depo girişinde okutun
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-[4mm]">
            <div className="bg-emerald-800 px-[4mm] py-[2.5mm] text-white">
              <p className="text-[8pt] font-semibold uppercase tracking-[0.2em] text-emerald-100">
                Parti No
              </p>
              <p
                className={`break-all font-mono font-bold leading-tight ${codeSize(batch.batch_number)}`}
              >
                {batch.batch_number}
              </p>
            </div>
            <div className="border-2 border-emerald-800 px-[4mm] py-[2.5mm]">
              <p className="text-[8pt] font-semibold uppercase tracking-[0.2em] text-emerald-800">
                Lot No
              </p>
              <p
                className={`break-all font-mono font-bold leading-tight ${codeSize(lot.lot_number)}`}
              >
                {lot.lot_number}
              </p>
            </div>
          </div>

          <div
            className={`grid gap-[4mm] ${isFinished ? "grid-cols-4" : "grid-cols-3"}`}
          >
            <Fact
              label="Üretim Miktarı"
              value={
                <>
                  {formatNumber(quantity)} {quantityDisplay.unit}
                  {quantityDisplay.breakdown ? (
                    <span className="block text-[8pt] font-normal text-neutral-600">
                      {quantityDisplay.breakdown}
                    </span>
                  ) : null}
                </>
              }
            />
            <Fact label="Üretim Tarihi" value={formatDate(batch.completed_at)} />
            <Fact
              label="Son Kullanma Tarihi"
              value={formatDate(lot.expiry_date)}
            />
            {isFinished ? (
              <Fact
                label="Yarı Mamül Partisi"
                value={
                  semiBatchNumbers.length > 0 ? semiBatchNumbers.join(", ") : "—"
                }
              />
            ) : null}
          </div>

          {/* Değişken uzunluktaki bölüm: ölçüler em, FitToPage puntoyu ayarlar. */}
          <div
            id="batch-card-body"
            className="flex flex-col gap-[1.3em]"
            style={{ fontSize: "9.5pt" }}
          >
            {contents.map((block, index) => (
              <div key={index}>
                <p className="mb-[0.4em] border-b border-neutral-400 pb-[0.25em] text-[0.95em] font-bold uppercase tracking-wider">
                  İçerik
                  <span className="ml-[0.6em] font-normal normal-case tracking-normal text-neutral-600">
                    {block.basis} içeriği
                  </span>
                </p>
                <div className="columns-2 gap-x-[8mm]">
                  {block.items.map((item) => (
                    <div
                      key={item.code}
                      className="flex break-inside-avoid items-baseline justify-between gap-[3mm] border-b border-dotted border-neutral-300 py-[0.2em]"
                    >
                      <span className="min-w-0 truncate">{item.name}</span>
                      <span className="shrink-0 font-mono font-semibold">
                        {item.amount}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {consumed.length > 0 ? (
              <div>
                <p className="mb-[0.4em] border-b border-neutral-400 pb-[0.25em] text-[0.95em] font-bold uppercase tracking-wider">
                  Kullanılan Lotlar
                </p>
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-[0.8em] uppercase tracking-wider text-neutral-500">
                      <th className="py-[0.15em] font-semibold">Malzeme</th>
                      <th className="py-[0.15em] font-semibold">Lot No</th>
                      <th className="py-[0.15em] text-right font-semibold">
                        Miktar
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {consumed.map((row) => (
                      <tr key={row.id} className="border-t border-neutral-200">
                        <td className="py-[0.2em] pr-[3mm]">
                          <span className="font-mono text-[0.9em]">
                            {row.materials?.code}
                          </span>{" "}
                          {row.materials?.name}
                        </td>
                        <td className="py-[0.2em] pr-[3mm] font-mono">
                          {row.material_lots?.lot_number ?? "—"}
                        </td>
                        <td className="whitespace-nowrap py-[0.2em] text-right font-mono">
                          {formatNumber(Number(row.quantity))}{" "}
                          {unitLabelForDisplay(consumedUom(row))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <p className="mt-auto border-t border-neutral-300 pt-[2mm] text-[7.5pt] text-neutral-500">
            Bu belge {company?.name ?? ""} üretim kayıtlarından oluşturulmuştur. QR
            kod çıkış lotunun kaydına gider.
          </p>
        </div>
      </div>
    </div>
  );
}
