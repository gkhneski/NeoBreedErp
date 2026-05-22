import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STOCK_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { PurchaseReceiptForm } from "./purchase-receipt-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type MaterialOption = {
  id: string;
  code: string;
  name: string;
  type: string;
  base_uom: string;
  default_supplier_id: string | null;
};

type SupplierOption = {
  id: string;
  code: string;
  name: string;
};

type LotOption = {
  id: string;
  lot_number: string;
  quantity_on_hand: number;
  materials: { code: string; name: string; base_uom: string } | null;
};

export default async function NewPurchaseReceiptPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    STOCK_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const [{ data: materials }, { data: suppliers }, { data: lots }] =
    await Promise.all([
      supabase
        .from("materials")
        .select("id, code, name, type, base_uom, default_supplier_id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("code", { ascending: true })
        .returns<MaterialOption[]>(),
      supabase
        .from("suppliers")
        .select("id, code, name")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("code", { ascending: true })
        .returns<SupplierOption[]>(),
      supabase
        .from("material_lots")
        .select(
          "id, lot_number, quantity_on_hand, materials:material_id(code, name, base_uom)",
        )
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("lot_number", { ascending: true })
        .returns<LotOption[]>(),
    ]);

  if ((materials ?? []).length === 0 && (lots ?? []).length === 0) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Yeni Fatura / İrsaliye
        </h1>
        <EmptyState
          title="Stoğa alınacak malzeme yok"
          description="Yeni alım belgesi oluşturmak için önce hammadde veya ürün kartı açın."
        />
        <Link href={companyModulePath(companyId, "materials", "new")}>
          <Button>Malzeme Oluştur</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Yeni Fatura / İrsaliye
        </h1>
        <p className="text-sm text-muted-foreground">
          Sirket ici manuel alım belgesi. Yeni lot acabilir veya mevcut bir
          lota ek stok girisi yapabilirsiniz.
        </p>
      </header>
      <PurchaseReceiptForm
        companyId={companyId}
        materials={materials ?? []}
        suppliers={suppliers ?? []}
        lots={lots ?? []}
      />
    </div>
  );
}
