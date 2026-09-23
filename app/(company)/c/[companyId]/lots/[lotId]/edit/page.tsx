import Link from "next/link";
import { notFound } from "next/navigation";

import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STOCK_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { LotEditForm } from "./lot-edit-form";

interface PageProps {
  params: Promise<{ companyId: string; lotId: string }>;
}

type LotRow = {
  id: string;
  lot_number: string;
  supplier_id: string | null;
  received_at: string | null;
  expiry_date: string | null;
  quantity_on_hand: number;
  unit_cost: number | null;
  currency: string | null;
  notes: string | null;
  owner_customer_id: string | null;
  materials: { code: string; name: string; base_uom: string } | null;
};

export default async function EditLotPage({ params }: PageProps) {
  const { companyId: routeCompanyId, lotId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    STOCK_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const [{ data: lot }, { data: suppliers }] = await Promise.all([
    supabase
      .from("material_lots")
      .select(
        "id, lot_number, supplier_id, received_at, expiry_date, quantity_on_hand, " +
          "unit_cost, currency, notes, owner_customer_id, " +
          "materials:material_id(code, name, base_uom)",
      )
      .eq("id", lotId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle<LotRow>(),
    supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("code", { ascending: true }),
  ]);

  if (!lot) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          <Link
            href={companyModulePath(companyId, "lots", lot.id)}
            className="hover:underline"
          >
            ← {lot.lot_number}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Lotu Düzenle</h1>
        <p className="text-sm text-muted-foreground">
          {lot.materials ? (
            <>
              <span className="font-mono">{lot.materials.code}</span> —{" "}
              {lot.materials.name}.{" "}
            </>
          ) : null}
          Malzeme değiştirilemez; hatalı malzemeyle açılmış lotu silip yeniden
          oluşturun.
        </p>
      </header>

      <LotEditForm
        companyId={companyId}
        suppliers={suppliers ?? []}
        initial={{
          id: lot.id,
          lot_number: lot.lot_number,
          supplier_id: lot.supplier_id,
          received_at: lot.received_at,
          expiry_date: lot.expiry_date,
          quantity_on_hand: Number(lot.quantity_on_hand),
          unit_cost: lot.unit_cost !== null ? Number(lot.unit_cost) : null,
          currency: lot.currency,
          notes: lot.notes,
          customerOwned: lot.owner_customer_id !== null,
          base_uom: lot.materials?.base_uom ?? "",
        }}
      />
    </div>
  );
}
