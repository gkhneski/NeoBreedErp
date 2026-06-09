import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
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
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
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
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
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

export default async function StockPage({ params, searchParams }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { tab: tabParam } = await searchParams;
  const { companyId, role } = await requireCompanyUser(routeCompanyId);
  const canWrite = canWriteCompanyData(role, STOCK_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  const tab: TabKey =
    tabParam === "urun" ||
    tabParam === "ambalaj" ||
    tabParam === "hareketler"
      ? tabParam
      : "hammadde";

  const stockBase = `id, code, name, base_uom, material_lots(quantity_on_hand, status, deleted_at)`;

  let stockRows: StockRow[] = [];
  let movementRows: MovementRow[] = [];

  if (tab === "hammadde") {
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
    const { data } = await supabase
      .from("stock_movements")
      .select(
        "id, kind, quantity, unit_cost, reason, occurred_at, notes, " +
          "materials:material_id(code, name, base_uom), " +
          "material_lots:lot_id(lot_number)",
      )
      .eq("company_id", companyId)
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
        {TABS.map((t) => (
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
      ) : (
        <StockTable rows={stockRows} companyId={companyId} canWrite={canWrite} />
      )}
    </div>
  );
}
