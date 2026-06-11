import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STOCK_WRITE_ROLES, companyModulePath } from "@/types/roles";

import { LotForm } from "./lot-form";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function NewLotPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyRole(
    routeCompanyId,
    STOCK_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const [materialsRes, suppliersRes, customersRes] = await Promise.all([
    supabase
      .from("materials")
      .select("id, code, name, type, base_uom, default_supplier_id")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("code", { ascending: true }),
    supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("code", { ascending: true }),
    supabase
      .from("customers")
      .select("id, code, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("code", { ascending: true }),
  ]);

  const materials = materialsRes.data ?? [];
  const suppliers = suppliersRes.data ?? [];
  const customers = customersRes.data ?? [];

  if (materials.length === 0) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Yeni Lot</h1>
        <p className="rounded-md border border-border bg-secondary/30 px-3 py-3 text-sm text-muted-foreground">
          Lot oluşturmak için önce en az bir malzeme tanımlamalısınız.
        </p>
        <Link href={companyModulePath(companyId, "materials", "new")}>
          <Button>Malzeme ekle</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Yeni Lot — Mal Kabul
        </h1>
        <p className="text-sm text-muted-foreground">
          Lot oluşturma aynı anda bir &quot;receipt&quot; stok hareketi kaydeder.
          Lot numarası malzeme bazında benzersiz olmalı. Lot ilk olarak{" "}
          <span className="font-medium text-foreground">Karantina</span>{" "}
          durumunda açılır; QC sonrası &quot;Serbest&quot;e alınır.
        </p>
      </header>
      <LotForm
        companyId={companyId}
        materials={materials}
        suppliers={suppliers}
        customers={customers}
      />
    </div>
  );
}
