import Link from "next/link";
import { notFound } from "next/navigation";

import { AttachmentList } from "@/components/files/attachment-list";
import { AttachmentUploader } from "@/components/files/attachment-uploader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireCompanyUser } from "@/lib/auth";
import {
  ATTACHMENT_KIND_LABEL,
  getSurfaceConfig,
} from "@/lib/storage/attachments";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { FileAttachment, LotStatus } from "@/types/database";
import {
  STOCK_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

import { TransferForm } from "./transfer-form";

interface PageProps {
  params: Promise<{ companyId: string; lotId: string }>;
}

type LotDetail = {
  id: string;
  lot_number: string;
  received_at: string | null;
  expiry_date: string | null;
  unit_cost: number | null;
  currency: string | null;
  quantity_on_hand: number;
  status: LotStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  location_id: string | null;
  materials: { id: string; code: string; name: string; base_uom: string } | null;
  suppliers: { id: string; code: string; name: string } | null;
  customers: { id: string; code: string; name: string } | null;
  locations: { id: string; code: string; name: string } | null;
};

const STATUS_LABEL: Record<LotStatus, string> = {
  quarantine: "Karantina",
  released: "Serbest",
  blocked: "Bloklu",
};

const STATUS_VARIANT: Record<
  LotStatus,
  "default" | "warning" | "destructive"
> = {
  quarantine: "warning",
  released: "default",
  blocked: "destructive",
};

function formatNumber(n: number): string {
  return Number(n).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
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

export default async function LotDetailPage({ params }: PageProps) {
  const { companyId: routeCompanyId, lotId } = await params;
  const { companyId, role } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const { data: lot } = await supabase
    .from("material_lots")
    .select(
      "id, lot_number, received_at, expiry_date, unit_cost, currency, quantity_on_hand, status, notes, created_at, updated_at, location_id, " +
        "materials:material_id(id, code, name, base_uom), " +
        "suppliers:supplier_id(id, code, name), " +
        "customers:owner_customer_id(id, code, name), " +
        "locations:location_id(id, code, name)",
    )
    .eq("id", lotId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle<LotDetail>();

  if (!lot) notFound();

  const { data: allLocations } = await supabase
    .from("locations")
    .select("id, code, name")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("code");
  const canTransfer = canWriteCompanyData(role, STOCK_WRITE_ROLES);

  const { data: attachments } = await supabase
    .from("file_attachments")
    .select(
      "id, company_id, subject_kind, material_lot_id, quality_check_id, kind, storage_path, file_name, mime_type, size_bytes, notes, created_at, created_by",
    )
    .eq("material_lot_id", lot.id)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .returns<FileAttachment[]>();

  const listHref = companyModulePath(companyId, "lots");
  const surface = getSurfaceConfig("material_lot");
  const kindOptions = surface.allowedKinds.map((k) => ({
    value: k,
    label: ATTACHMENT_KIND_LABEL[k],
  }));

  return (
    <div className="max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href={listHref}
              className="text-xs text-muted-foreground hover:underline"
            >
              Lotlar
            </Link>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="font-mono text-sm">{lot.lot_number}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Lot — {lot.lot_number}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={STATUS_VARIANT[lot.status]}>
              {STATUS_LABEL[lot.status]}
            </Badge>
            {lot.customers ? (
              <Badge variant="warning">
                Müşteri Malı — {lot.customers.name}
              </Badge>
            ) : null}
            {lot.materials ? (
              <span>
                <span className="font-mono">{lot.materials.code}</span> —{" "}
                {lot.materials.name}
              </span>
            ) : null}
          </div>
        </div>
        <Link href={listHref}>
          <Button variant="outline">Listeye Dön</Button>
        </Link>
      </header>

      <section className="rounded-md border border-border p-4">
        <h2 className="mb-2 text-sm font-medium">Lot Bilgileri</h2>
        <dl>
          <DefinitionRow label="Alış Tarihi">
            {lot.received_at ?? <span className="text-muted-foreground">—</span>}
          </DefinitionRow>
          <DefinitionRow label="Son Kullanma">
            {lot.expiry_date ?? <span className="text-muted-foreground">—</span>}
          </DefinitionRow>
          <DefinitionRow label="Eldeki Miktar">
            <span className="font-mono">
              {formatNumber(Number(lot.quantity_on_hand))}{" "}
              <span className="text-muted-foreground">
                {lot.materials?.base_uom ?? ""}
              </span>
            </span>
          </DefinitionRow>
          <DefinitionRow label="Birim Maliyet">
            {lot.unit_cost !== null ? (
              <span className="font-mono">
                {formatNumber(Number(lot.unit_cost))} {lot.currency ?? ""}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </DefinitionRow>
          <DefinitionRow label="Tedarikçi">
            {lot.suppliers ? (
              <Link
                href={companyModulePath(companyId, "suppliers")}
                className="hover:underline"
              >
                <span className="font-mono text-xs">{lot.suppliers.code}</span>{" "}
                — {lot.suppliers.name}
              </Link>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </DefinitionRow>
          <DefinitionRow label="Sahibi">
            {lot.customers ? (
              <Link
                href={companyModulePath(companyId, "customers")}
                className="hover:underline"
              >
                <span className="font-mono text-xs">{lot.customers.code}</span>{" "}
                — {lot.customers.name} (müşteri malı)
              </Link>
            ) : (
              <span className="text-muted-foreground">Kendi malımız</span>
            )}
          </DefinitionRow>
          <DefinitionRow label="Depo">
            {lot.locations ? (
              <span>
                <span className="font-mono text-xs">{lot.locations.code}</span>{" "}
                — {lot.locations.name}
              </span>
            ) : (
              <span className="text-muted-foreground">Ana Depo</span>
            )}
          </DefinitionRow>
        </dl>
      </section>

      <div>
        <Link href={companyModulePath(companyId, "lots", lot.id, "label")}>
          <Button variant="outline">Etiket Yazdır (QR)</Button>
        </Link>
      </div>

      {canTransfer ? (
        <section className="rounded-md border border-border p-4">
          <h2 className="mb-1 text-sm font-medium">Depo Transferi</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Lot tam olarak hedef depoya taşınır; hareket defterine transfer
            kaydı düşülür. Yalnızca &quot;Serbest&quot; lotlar transfer
            edilebilir.
          </p>
          <TransferForm
            companyId={companyId}
            lotId={lot.id}
            currentLocationId={lot.location_id}
            locations={allLocations ?? []}
            lotReleased={lot.status === "released"}
          />
        </section>
      ) : null}

      {lot.notes ? (
        <section className="rounded-md border border-border p-4">
          <h2 className="mb-2 text-sm font-medium">Notlar</h2>
          <p className="whitespace-pre-wrap text-sm">{lot.notes}</p>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">Ekli Dosyalar</h2>
            <p className="text-xs text-muted-foreground">
              Analiz sertifikası (CoA), MSDS, fatura veya destekleyici belgeler.
            </p>
          </div>
        </div>
        <AttachmentList
          companyId={companyId}
          rows={attachments ?? []}
          canDelete
        />
        <AttachmentUploader
          companyId={companyId}
          subjectKind="material_lot"
          subjectId={lot.id}
          kindOptions={kindOptions}
          defaultKind={surface.defaultKind}
          acceptMime={surface.allowedMime.join(",")}
          maxBytes={surface.maxBytes}
        />
      </section>

      <footer className="text-xs text-muted-foreground">
        Oluşturuldu: {new Date(lot.created_at).toLocaleString("tr-TR")} ·
        Güncellendi: {new Date(lot.updated_at).toLocaleString("tr-TR")}
      </footer>
    </div>
  );
}
