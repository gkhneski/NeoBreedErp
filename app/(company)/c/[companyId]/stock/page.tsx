import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  STOCK_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

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

const KIND_LABEL: Record<MovementRow["kind"], string> = {
  receipt: "Mal Kabul",
  issue: "Çıkış",
  adjustment: "Düzeltme",
};

const KIND_VARIANT: Record<
  MovementRow["kind"],
  "default" | "secondary" | "warning" | "destructive"
> = {
  receipt: "default",
  issue: "secondary",
  adjustment: "warning",
};

function formatNumber(n: number): string {
  return Number(n).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default async function StockLedgerPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const { data: movements } = await supabase
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

  const rows = movements ?? [];
  const newHref = companyModulePath(companyId, "stock", "new");

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Stok Hareketleri
          </h1>
          <p className="text-sm text-muted-foreground">
            Append-only defter: mal kabul, çıkış ve sayım düzeltmeleri. Hata
            düzeltmek için satır silmek yerine bir &quot;düzeltme&quot; hareketi
            kaydedin. Son 200 kayıt gösteriliyor.
          </p>
        </div>
        {canWriteCompanyData(role, STOCK_WRITE_ROLES) ? (
          <Link href={newHref}>
            <Button>Yeni Hareket</Button>
          </Link>
        ) : null}
      </header>

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Tarih</th>
                <th className="px-3 py-2 text-left font-medium">Tür</th>
                <th className="px-3 py-2 text-left font-medium">Malzeme</th>
                <th className="px-3 py-2 text-left font-medium">Lot</th>
                <th className="px-3 py-2 text-right font-medium">Miktar</th>
                <th className="px-3 py-2 text-left font-medium">Sebep / Not</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const isOut = Number(m.quantity) < 0;
                return (
                  <tr key={m.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatDateTime(m.occurred_at)}
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
                          <span className="ml-1">— {m.materials.name}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {m.material_lots?.lot_number ?? "—"}
                    </td>
                    <td
                      className={
                        "px-3 py-2 text-right font-mono text-xs " +
                        (isOut ? "text-destructive" : "text-foreground")
                      }
                    >
                      {isOut ? "" : "+"}
                      {formatNumber(Number(m.quantity))}{" "}
                      <span className="text-muted-foreground">
                        {m.materials?.base_uom ?? ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {m.reason ? <div>{m.reason}</div> : null}
                      {m.notes ? <div className="opacity-70">{m.notes}</div> : null}
                      {!m.reason && !m.notes ? "—" : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Henüz stok hareketi yok"
          description="İlk hareketi oluşturmak için bir lot açın (mal kabul) ya da mevcut bir lottan çıkış yapın."
        />
      )}
    </div>
  );
}
