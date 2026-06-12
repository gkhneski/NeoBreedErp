import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AttachmentList } from "@/components/files/attachment-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth";
import {
  SIGNED_URL_TTL_SECONDS,
  TENANT_FILES_BUCKET,
} from "@/lib/storage/attachments";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  MASTER_DATA_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

import { ALLERGEN_LABELS, type AllergenCode } from "../../materials/allergens";
import { deleteMaterial } from "../../materials/actions";
import { MaterialCertificateUploader } from "../../materials/[materialId]/certificate-uploader";
import type { FileAttachment } from "@/types/database";

interface PageProps {
  params: Promise<{ companyId: string; productId: string }>;
}

type ProductDetail = {
  id: string;
  code: string;
  name: string;
  base_uom: string;
  density: number | null;
  allergen_flags: unknown;
  storage_conditions: string | null;
  regulatory_notes: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type LotRow = {
  id: string;
  lot_number: string;
  quantity_on_hand: number;
  status: "quarantine" | "released" | "blocked";
  received_at: string;
  expiry_date: string | null;
};

const LOT_STATUS_LABEL: Record<LotRow["status"], string> = {
  quarantine: "Karantina",
  released: "Serbest",
  blocked: "Bloke",
};

const LOT_STATUS_VARIANT: Record<
  LotRow["status"],
  "default" | "warning" | "destructive"
> = {
  released: "default",
  quarantine: "warning",
  blocked: "destructive",
};

function asAllergenList(value: unknown): AllergenCode[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is AllergenCode => typeof v === "string" && v in ALLERGEN_LABELS,
  );
}

function DefinitionRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-3 border-b border-border py-2 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function formatNumber(n: number): string {
  return Number(n).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { companyId: routeCompanyId, productId } = await params;
  const { companyId, role } = await requireModuleAccess(routeCompanyId, "products");
  const supabase = await createServerSupabaseClient();

  const { data: product } = await supabase
    .from("materials")
    .select(
      "id, code, name, base_uom, density, allergen_flags, storage_conditions, regulatory_notes, notes, created_at, updated_at",
    )
    .eq("company_id", companyId)
    .eq("id", productId)
    .eq("type", "finished")
    .is("deleted_at", null)
    .maybeSingle<ProductDetail>();

  if (!product) notFound();

  const { data: lots } = await supabase
    .from("material_lots")
    .select("id, lot_number, quantity_on_hand, status, received_at, expiry_date")
    .eq("company_id", companyId)
    .eq("material_id", product.id)
    .is("deleted_at", null)
    .order("received_at", { ascending: false })
    .returns<LotRow[]>();

  const lotIds = (lots ?? []).map((lot) => lot.id);
  const { data: certificates } =
    lotIds.length > 0
      ? await supabase
          .from("file_attachments")
          .select(
            "id, company_id, subject_kind, material_lot_id, quality_check_id, kind, storage_path, file_name, mime_type, size_bytes, notes, created_at, created_by",
          )
          .eq("company_id", companyId)
          .eq("kind", "coa")
          .in("material_lot_id", lotIds)
          .order("created_at", { ascending: false })
          .returns<FileAttachment[]>()
      : { data: [] };

  const thumbnailPath = `${companyId}/products/${product.id}/thumbnail`;
  const { data: signedThumbnail } = await supabase.storage
    .from(TENANT_FILES_BUCKET)
    .createSignedUrl(thumbnailPath, SIGNED_URL_TTL_SECONDS);

  const allergens = asAllergenList(product.allergen_flags);
  const listHref = companyModulePath(companyId, "products");
  const canWrite = canWriteCompanyData(role, MASTER_DATA_WRITE_ROLES);
  const editHref = companyModulePath(companyId, "products", product.id, "edit");
  const deleteAction = deleteMaterial.bind(null, companyId, product.id, listHref);

  const lotsForUploader = (lots ?? []).map((lot) => ({
    id: lot.id,
    lot_number: lot.lot_number,
    quantity_on_hand: lot.quantity_on_hand,
  }));

  return (
    <div className="max-w-3xl space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-secondary">
            {signedThumbnail?.signedUrl ? (
              <Image
                src={signedThumbnail.signedUrl}
                alt=""
                fill
                sizes="64px"
                className="object-cover"
                unoptimized
              />
            ) : null}
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Bitmiş Ürün
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {product.name}
            </h1>
            <p className="font-mono text-sm text-muted-foreground">
              {product.code}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {canWrite ? (
            <>
              <Link href={editHref}>
                <Button variant="outline">Düzenle</Button>
              </Link>
              <form action={deleteAction}>
                <Button type="submit" variant="destructive">
                  Sil
                </Button>
              </form>
            </>
          ) : null}
          <Link href={listHref}>
            <Button variant="outline">Listeye Dön</Button>
          </Link>
        </div>
      </header>

      <section className="rounded-md border border-border p-4">
        <h2 className="mb-2 text-sm font-medium">Temel Bilgiler</h2>
        <dl>
          <DefinitionRow label="Baz Birim">
            <span className="font-mono">{product.base_uom}</span>
          </DefinitionRow>
          <DefinitionRow label="Yoğunluk">
            {product.density !== null ? (
              <span className="tabular-nums">{product.density} g/mL</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </DefinitionRow>
        </dl>
      </section>

      <section className="rounded-md border border-border p-4">
        <h2 className="mb-2 text-sm font-medium">Alerjenler</h2>
        {allergens.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {allergens.map((code) => (
              <Badge key={code} variant="warning">
                {ALLERGEN_LABELS[code]}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Bildirilen alerjen yok.
          </p>
        )}
      </section>

      <section className="rounded-md border border-border p-4">
        <h2 className="mb-2 text-sm font-medium">Saklama & Mevzuat</h2>
        <dl>
          <DefinitionRow label="Saklama Koşulları">
            {product.storage_conditions ?? (
              <span className="text-muted-foreground">—</span>
            )}
          </DefinitionRow>
          <DefinitionRow label="Mevzuat Notları">
            {product.regulatory_notes ? (
              <span className="whitespace-pre-wrap">
                {product.regulatory_notes}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </DefinitionRow>
        </dl>
      </section>

      {product.notes ? (
        <section className="rounded-md border border-border p-4">
          <h2 className="mb-2 text-sm font-medium">Notlar</h2>
          <p className="whitespace-pre-wrap text-sm">{product.notes}</p>
        </section>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">Lotlar</h2>
          <p className="text-xs text-muted-foreground">
            Üretimden veya stok girişinden gelen lot kayıtları.
          </p>
        </div>
        {lots && lots.length > 0 ? (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Lot No</th>
                  <th className="px-3 py-2 text-right font-medium">Stok</th>
                  <th className="px-3 py-2 text-left font-medium">Durum</th>
                  <th className="px-3 py-2 text-left font-medium">Giriş</th>
                  <th className="px-3 py-2 text-left font-medium">SKT</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((lot) => (
                  <tr key={lot.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">
                      {lot.lot_number}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {formatNumber(Number(lot.quantity_on_hand))}{" "}
                      <span className="text-muted-foreground">
                        {product.base_uom}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={LOT_STATUS_VARIANT[lot.status]}>
                        {LOT_STATUS_LABEL[lot.status]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(lot.received_at).toLocaleDateString("tr-TR")}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {lot.expiry_date
                        ? new Date(lot.expiry_date).toLocaleDateString("tr-TR")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border bg-card/40 px-3 py-4 text-xs text-muted-foreground">
            Bu ürün için henüz lot kaydı yok.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">Analiz Sertifikaları</h2>
          <p className="text-xs text-muted-foreground">
            Sertifikalar lot bazlı saklanır; burada bu ürünün tüm lot CoA
            dosyaları görünür.
          </p>
        </div>
        <AttachmentList
          companyId={companyId}
          rows={certificates ?? []}
          canDelete={canWrite}
        />
        {canWrite ? (
          <MaterialCertificateUploader
            companyId={companyId}
            lots={lotsForUploader}
          />
        ) : null}
      </section>

      <footer className="text-xs text-muted-foreground">
        Oluşturuldu: {new Date(product.created_at).toLocaleString("tr-TR")} ·
        Güncellendi: {new Date(product.updated_at).toLocaleString("tr-TR")}
      </footer>
    </div>
  );
}
