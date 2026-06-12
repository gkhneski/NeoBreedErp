import Link from "next/link";
import { notFound } from "next/navigation";

import { AttachmentList } from "@/components/files/attachment-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  MASTER_DATA_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

import { ALLERGEN_LABELS, type AllergenCode } from "../allergens";
import { deleteMaterial } from "../actions";
import { MaterialCertificateUploader } from "./certificate-uploader";
import type { FileAttachment } from "@/types/database";

interface PageProps {
  params: Promise<{ companyId: string; materialId: string }>;
}

const TYPE_LABEL: Record<string, string> = {
  raw: "Hammadde",
  finished: "Bitmiş Ürün",
};

type MaterialDetail = {
  id: string;
  code: string;
  name: string;
  type: string;
  base_uom: string;
  density: number | null;
  allergen_flags: unknown;
  storage_conditions: string | null;
  regulatory_notes: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  suppliers: { id: string; code: string; name: string } | null;
};

type LotOption = {
  id: string;
  lot_number: string;
  quantity_on_hand: number;
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

export default async function MaterialDetailPage({ params }: PageProps) {
  const { companyId: routeCompanyId, materialId } = await params;
  const { companyId, role } = await requireModuleAccess(routeCompanyId, "materials");
  const supabase = await createServerSupabaseClient();

  const { data: material } = await supabase
    .from("materials")
    .select(
      "id, code, name, type, base_uom, density, allergen_flags, storage_conditions, regulatory_notes, notes, created_at, updated_at, suppliers:default_supplier_id(id, code, name)",
    )
    .eq("company_id", companyId)
    .eq("id", materialId)
    .is("deleted_at", null)
    .maybeSingle<MaterialDetail>();

  if (!material) notFound();

  const { data: lots } = await supabase
    .from("material_lots")
    .select("id, lot_number, quantity_on_hand")
    .eq("company_id", companyId)
    .eq("material_id", material.id)
    .is("deleted_at", null)
    .order("received_at", { ascending: false })
    .returns<LotOption[]>();

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

  const allergens = asAllergenList(material.allergen_flags);
  const listHref = companyModulePath(companyId, "materials");
  const canWrite = canWriteCompanyData(role, MASTER_DATA_WRITE_ROLES);
  const editHref = companyModulePath(companyId, "materials", material.id, "edit");
  const deleteAction = deleteMaterial.bind(null, companyId, material.id, listHref);

  return (
    <div className="max-w-3xl space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Malzeme
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {material.name}
          </h1>
          <p className="font-mono text-sm text-muted-foreground">
            {material.code}
          </p>
        </div>
        {canWrite ? (
          <div className="flex gap-2">
            <Link href={editHref}>
              <Button variant="outline">Duzenle</Button>
            </Link>
            <form action={deleteAction}>
              <Button type="submit" variant="destructive">
                Sil
              </Button>
            </form>
          </div>
        ) : null}
        <Link href={listHref}>
          <Button variant="outline">Listeye Dön</Button>
        </Link>
      </header>

      <section className="rounded-md border border-border p-4">
        <h2 className="mb-2 text-sm font-medium">Temel Bilgiler</h2>
        <dl>
          <DefinitionRow label="Tip">
            {TYPE_LABEL[material.type] ?? material.type}
          </DefinitionRow>
          <DefinitionRow label="Baz Birim">
            <span className="font-mono">{material.base_uom}</span>
          </DefinitionRow>
          <DefinitionRow label="Yoğunluk">
            {material.density !== null ? (
              <span className="tabular-nums">{material.density} g/mL</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </DefinitionRow>
          <DefinitionRow label="Varsayılan Tedarikçi">
            {material.suppliers ? (
              <Link
                href={companyModulePath(companyId, "suppliers")}
                className="hover:underline"
              >
                <span className="font-mono text-xs">
                  {material.suppliers.code}
                </span>{" "}
                — {material.suppliers.name}
              </Link>
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
            {material.storage_conditions ?? (
              <span className="text-muted-foreground">—</span>
            )}
          </DefinitionRow>
          <DefinitionRow label="Mevzuat Notları">
            {material.regulatory_notes ? (
              <span className="whitespace-pre-wrap">
                {material.regulatory_notes}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </DefinitionRow>
        </dl>
      </section>

      {material.notes ? (
        <section className="rounded-md border border-border p-4">
          <h2 className="mb-2 text-sm font-medium">Notlar</h2>
          <p className="whitespace-pre-wrap text-sm">{material.notes}</p>
        </section>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">Analiz Sertifikalari</h2>
          <p className="text-xs text-muted-foreground">
            Sertifikalar lot bazli saklanir; burada bu malzemenin tum lot CoA
            dosyalari gorunur.
          </p>
        </div>
        <AttachmentList
          companyId={companyId}
          rows={certificates ?? []}
          canDelete={canWrite}
        />
        {canWrite ? (
          <MaterialCertificateUploader companyId={companyId} lots={lots ?? []} />
        ) : null}
      </section>

      <footer className="text-xs text-muted-foreground">
        Oluşturuldu: {new Date(material.created_at).toLocaleString("tr-TR")} ·
        Güncellendi: {new Date(material.updated_at).toLocaleString("tr-TR")}
      </footer>
    </div>
  );
}
