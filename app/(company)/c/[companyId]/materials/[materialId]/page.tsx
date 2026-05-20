import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

import { ALLERGEN_LABELS, type AllergenCode } from "../allergens";

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
  const { companyId } = await requireCompanyUser(routeCompanyId);
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

  const allergens = asAllergenList(material.allergen_flags);
  const listHref = companyModulePath(companyId, "materials");

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

      <footer className="text-xs text-muted-foreground">
        Oluşturuldu: {new Date(material.created_at).toLocaleString("tr-TR")} ·
        Güncellendi: {new Date(material.updated_at).toLocaleString("tr-TR")}
      </footer>
    </div>
  );
}
