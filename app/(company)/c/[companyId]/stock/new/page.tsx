import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STOCK_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { StockMovementForm } from "./stock-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

type LotOption = {
  id: string;
  lot_number: string;
  quantity_on_hand: number;
  status: "quarantine" | "released" | "blocked";
  materials: { code: string; name: string; base_uom: string } | null;
};

export default async function NewStockMovementPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireCompanyRole(
    routeCompanyId,
    STOCK_WRITE_ROLES,
  );

  // Manuel stok hareketi (cikis/sayim duzeltmesi) fabrika/admin konusu;
  // depo personeli finished urunlerini Barkod Tara ve siparislerle yonetir.
  if (role === "operator") {
    redirect(companyModulePath(companyId, "stock"));
  }

  const supabase = await createServerSupabaseClient();

  const { data: lots } = await supabase
    .from("material_lots")
    .select(
      "id, lot_number, quantity_on_hand, status, materials:material_id(code, name, base_uom)",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("lot_number", { ascending: true })
    .returns<LotOption[]>();

  const options = lots ?? [];

  if (options.length === 0) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Yeni Stok Hareketi
        </h1>
        <p className="rounded-md border border-border bg-secondary/30 px-3 py-3 text-sm text-muted-foreground">
          Çıkış veya düzeltme yapmak için önce en az bir lot açmalısınız.
        </p>
        <Link href={companyModulePath(companyId, "lots", "new")}>
          <Button>Mal kabul ile lot oluştur</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Yeni Stok Hareketi
        </h1>
        <p className="text-sm text-muted-foreground">
          Mal kabul &quot;Yeni Lot&quot; ekranından kaydedilir — burada çıkış (issue) veya
          sayım düzeltmesi (adjustment) yapın. Bir lottan çıkış için lotun
          durumu <span className="font-medium text-foreground">Serbest</span>{" "}
          olmalı.
        </p>
      </header>
      <StockMovementForm companyId={companyId} lots={options} />
    </div>
  );
}
