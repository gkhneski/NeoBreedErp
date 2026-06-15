import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
import { getExpiryThresholds } from "@/lib/company-settings";
import {
  EXPIRY_BADGE_CLASS,
  EXPIRY_LABEL,
  daysUntil,
  expiryUrgency,
  type ExpiryThresholds,
  type ExpiryUrgency,
} from "@/lib/expiry";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { STOCK_WRITE_ROLES, canWriteCompanyData, companyModulePath } from "@/types/roles";

import { KIND_LABEL, KIND_VARIANT } from "./constants";

interface PageProps {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ tab?: string }>;
}

type StockRow = {
  id: string;
  code: string;
  name: string;
  base_uom: string;
  material_lots: Array<{
    quantity_on_hand: number;
    status: string;
    deleted_at: string | null;
  }> | null;
};

type MovementRow = {
  id: string;
  kind: "receipt" | "issue" | "adjustment";
  quantity: number;
  unit_cost: number | null;
  reason: string | null;
  occurred_at: string;
  notes: string | null;
  materials: { code: string; name: string; base_uom: string } | null;
  material_lots: { lot_number: string } | null;
};

const TABS = [
  { key: "hammadde", label: "Hammadde Stok" },
  { key: "urun", label: "Bitmiş Ürün Stok" },
  { key: "ambalaj", label: "Ambalaj Stok" },
  { key: "hareketler", label: "Stok Hareketleri" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// operator = depo personeli: hammadde/ambalaj fabrika konusu, depo yalnizca bitmis urun gorur
const OPERATOR_TABS = new Set<TabKey>(["urun", "hareketler"]);

function formatQty(n: number): string {
  return Number(n).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

function formatDT(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function StockTable({
  rows,
  companyId,
  canWrite,
}: {
  rows: StockRow[];
  companyId: string;
  canWrite: boolean;
}) {
  const purchaseHref = companyModulePath(companyId, "purchases", "new");

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Stok kaydı yok"
        description="Mal kabul yaparak stok oluşturun."
        action={
          canWrite ? (
            <Link href={purchaseHref}>
              <Button>Mal Kabul</Button>
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {canWrite ? (
        <div className="flex justify-end">
          <Link href={purchaseHref}>
            <Button size="sm">+ Mal Kabul</Button>
          </Link>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Kod</th>
              <th className="px-3 py-2 text-left font-medium">Ad</th>
              <th className="px-3 py-2 text-right font-medium">Serbest</th>
              <th className="px-3 py-2 text-right font-medium">Karantina</th>
              <th className="px-3 py-2 text-right font-medium">Bloklu</th>
              <th className="px-3 py-2 text-left font-medium">Birim</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const lots = (m.material_lots ?? []).filter(
                (l) => l.deleted_at === null,
              );
              const released = lots
                .filter((l) => l.status === "released")
                .reduce((s, l) => s + Number(l.quantity_on_hand), 0);
              const quarantine = lots
                .filter((l) => l.status === "quarantine")
                .reduce((s, l) => s + Number(l.quantity_on_hand), 0);
              const blocked = lots
                .filter((l) => l.status === "blocked")
                .reduce((s, l) => s + Number(l.quantity_on_hand), 0);

              return (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link
                      href={companyModulePath(companyId, "materials", m.id)}
                      className="hover:underline"
                    >
                      {m.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{m.name}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {formatQty(released)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                    {quarantine > 0 ? formatQty(quarantine) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-destructive">
                    {blocked > 0 ? formatQty(blocked) : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {m.base_uom}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MovementsTable({
  rows,
  companyId,
  canWrite,
}: {
  rows: MovementRow[];
  companyId: string;
  canWrite: boolean;
}) {
  const newHref = companyModulePath(companyId, "stock", "new");

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Stok hareketi yok"
        description="İlk hareketi oluşturmak için bir lot açın veya mevcut lottan çıkış yapın."
      />
    );
  }

  return (
    <div className="space-y-4">
      {canWrite ? (
        <div className="flex justify-end">
          <Link href={newHref}>
            <Button size="sm">+ Yeni Hareket</Button>
          </Link>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Tarih</th>
              <th className="px-3 py-2 text-left font-medium">Tür</th>
              <th className="px-3 py-2 text-left font-medium">Malzeme</th>
              <th className="px-3 py-2 text-left font-medium">Lot</th>
              <th className="px-3 py-2 text-right font-medium">Miktar</th>
              <th className="px-3 py-2 text-left font-medium">Not</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const isOut = Number(m.quantity) < 0;
              return (
                <tr key={m.id} className="border-t border-border align-top">
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDT(m.occurred_at)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={KIND_VARIANT[m.kind]}>
                      {KIND_LABEL[m.kind]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    {m.materials ? (
                      <span>
                        <span className="font-mono text-xs">
                          {m.materials.code}
                        </span>
                        <span className="ml-1 text-muted-foreground">
                          — {m.materials.name}
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {m.material_lots?.lot_number ?? "—"}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-mono text-xs",
                      isOut ? "text-destructive" : "text-foreground",
                    )}
                  >
                    {isOut ? "" : "+"}
                    {formatQty(Number(m.quantity))}{" "}
                    <span className="text-muted-foreground">
                      {m.materials?.base_uom ?? ""}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {m.reason ? <div>{m.reason}</div> : null}
                    {m.notes ? (
                      <div className="opacity-70">{m.notes}</div>
                    ) : null}
                    {!m.reason && !m.notes ? "—" : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type FinishedLotRow = {
  id: string;
  lot_number: string;
  expiry_date: string | null;
  quantity_on_hand: number;
  status: "quarantine" | "released" | "blocked";
  materials: { code: string; name: string; base_uom: string } | null;
  locations: { code: string; name: string; is_default: boolean } | null;
};

const LOT_STATUS_LABEL: Record<FinishedLotRow["status"], string> = {
  quarantine: "Karantina",
  released: "Serbest",
  blocked: "Bloklu",
};

const LOT_STATUS_VARIANT: Record<
  FinishedLotRow["status"],
  "default" | "warning" | "destructive"
> = {
  quarantine: "warning",
  released: "default",
  blocked: "destructive",
};

// Depo gorunumu: bitmis urunler lot bazinda — adet, raf, SKT, durum.
function FinishedLotTable({
  rows,
  thresholds,
}: {
  rows: FinishedLotRow[];
  thresholds: ExpiryThresholds;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Bitmiş ürün stoğu yok"
        description="Üretim tamamlanıp depoya alındığında bitmiş ürün lotları burada listelenir."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Lot No</th>
            <th className="px-3 py-2 text-left font-medium">Ürün</th>
            <th className="px-3 py-2 text-left font-medium">Raf / Konum</th>
            <th className="px-3 py-2 text-right font-medium">Eldeki</th>
            <th className="px-3 py-2 text-left font-medium">SKT</th>
            <th className="px-3 py-2 text-left font-medium">Durum</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((lot) => {
            const urgency: ExpiryUrgency | null = expiryUrgency(
              lot.expiry_date,
              thresholds,
            );
            const dte = daysUntil(lot.expiry_date);
            return (
              <tr key={lot.id} className="border-t border-border align-top">
                <td className="px-3 py-2 font-mono text-xs">
                  {lot.lot_number}
                </td>
                <td className="px-3 py-2">
                  {lot.materials ? (
                    <span>
                      <span className="font-mono text-xs">
                        {lot.materials.code}
                      </span>
                      <span className="ml-1">— {lot.materials.name}</span>
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {lot.locations ? (
                    lot.locations.is_default ? (
                      <span className="text-muted-foreground">
                        {lot.locations.name}
                      </span>
                    ) : (
                      <Badge variant="outline">{lot.locations.code}</Badge>
                    )
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {formatQty(Number(lot.quantity_on_hand))}{" "}
                  <span className="text-muted-foreground">
                    {lot.materials?.base_uom ?? ""}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  <div className="flex flex-col gap-1">
                    <span>{lot.expiry_date ?? "—"}</span>
                    {urgency && urgency !== "ok" ? (
                      <span
                        className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${EXPIRY_BADGE_CLASS[urgency]}`}
                      >
                        {urgency === "expired"
                          ? EXPIRY_LABEL.expired
                          : `${EXPIRY_LABEL[urgency]} · ${dte}g`}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Badge variant={LOT_STATUS_VARIANT[lot.status]}>
                    {LOT_STATUS_LABEL[lot.status]}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function StockPage({ params, searchParams }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { tab: tabParam } = await searchParams;
  const { companyId, role } = await requireCompanyUser(routeCompanyId);
  const canWrite = canWriteCompanyData(role, STOCK_WRITE_ROLES);
  const isOperator = role === "operator";
  const visibleTabs = isOperator
    ? TABS.filter((t) => OPERATOR_TABS.has(t.key))
    : TABS;
  const supabase = await createServerSupabaseClient();

  const requested: TabKey =
    tabParam === "urun" ||
    tabParam === "ambalaj" ||
    tabParam === "hareketler"
      ? tabParam
      : "hammadde";
  const tab: TabKey =
    isOperator && !OPERATOR_TABS.has(requested) ? "urun" : requested;

  const stockBase = `id, code, name, base_uom, material_lots(quantity_on_hand, status, deleted_at)`;

  let stockRows: StockRow[] = [];
  let movementRows: MovementRow[] = [];
  let finishedLotRows: FinishedLotRow[] = [];
  const thresholds = isOperator ? await getExpiryThresholds(companyId) : null;

  if (isOperator && tab === "urun") {
    // Depocu yalnizca KENDI deposundaki bitmis urunu gorur: varsayilan konum
    // (Ana Depo = fabrika ana deposu, is_default) fabrikaya aittir; oradaki
    // karantina/uretim stogu henuz depoya devredilmemistir. !inner + is_default
    // = false ile sadece devredilmis depo lotlari listelenir.
    const { data } = await supabase
      .from("material_lots")
      .select(
        "id, lot_number, expiry_date, quantity_on_hand, status, " +
          "materials:material_id!inner(code, name, base_uom, type), " +
          "locations:location_id!inner(code, name, is_default)",
      )
      .eq("company_id", companyId)
      .eq("materials.type", "finished")
      .eq("locations.is_default", false)
      .is("deleted_at", null)
      .gt("quantity_on_hand", 0)
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .returns<FinishedLotRow[]>();
    finishedLotRows = data ?? [];
  } else if (tab === "hammadde") {
    const { data } = await supabase
      .from("materials")
      .select(stockBase)
      .eq("company_id", companyId)
      .eq("type", "raw")
      .not("code", "ilike", "AMB-%")
      .not("code", "ilike", "PKG-%")
      .is("deleted_at", null)
      .order("code", { ascending: true })
      .returns<StockRow[]>();
    stockRows = data ?? [];
  } else if (tab === "urun") {
    const { data } = await supabase
      .from("materials")
      .select(stockBase)
      .eq("company_id", companyId)
      .eq("type", "finished")
      .is("deleted_at", null)
      .order("code", { ascending: true })
      .returns<StockRow[]>();
    stockRows = data ?? [];
  } else if (tab === "ambalaj") {
    const { data } = await supabase
      .from("materials")
      .select(stockBase)
      .eq("company_id", companyId)
      .eq("type", "raw")
      .or("code.ilike.AMB-%,code.ilike.PKG-%")
      .is("deleted_at", null)
      .order("code", { ascending: true })
      .returns<StockRow[]>();
    stockRows = data ?? [];
  } else {
    let query = supabase
      .from("stock_movements")
      .select(
        "id, kind, quantity, unit_cost, reason, occurred_at, notes, " +
          `materials:material_id${isOperator ? "!inner" : ""}(code, name, base_uom), ` +
          "material_lots:lot_id!inner(lot_number, deleted_at)",
      )
      .eq("company_id", companyId)
      // Hide movements of removed (soft-deleted) lots from the ledger view.
      .is("material_lots.deleted_at", null);
    if (isOperator) {
      query = query.eq("materials.type", "finished");
    }
    const { data } = await query
      .order("occurred_at", { ascending: false })
      .limit(200)
      .returns<MovementRow[]>();
    movementRows = data ?? [];
  }

  const stockPath = companyModulePath(companyId, "stock");

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Stok</h1>
        <p className="text-sm text-muted-foreground">
          Malzeme bazında eldeki stok ve hareket defteri.
        </p>
      </header>

      <div className="flex gap-1 border-b border-border">
        {visibleTabs.map((t) => (
          <Link
            key={t.key}
            href={`${stockPath}?tab=${t.key}`}
            className={cn(
              "rounded-t-md px-4 py-2 text-sm transition-colors",
              tab === t.key
                ? "border-b-2 border-primary font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "hareketler" ? (
        <MovementsTable
          rows={movementRows}
          companyId={companyId}
          canWrite={canWrite}
        />
      ) : isOperator && tab === "urun" && thresholds ? (
        <FinishedLotTable rows={finishedLotRows} thresholds={thresholds} />
      ) : (
        <StockTable
          rows={stockRows}
          companyId={companyId}
          canWrite={canWrite && !isOperator}
        />
      )}
    </div>
  );
}
