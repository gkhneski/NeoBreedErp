import { EmptyState } from "@/components/ui/empty-state";
import { requireModuleAccess } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";

import { BuyersAdmin, type BuyerAccount, type CustomerOption } from "./buyers-admin";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function BuyersPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireModuleAccess(routeCompanyId, "buyers");
  const canManage = role === "company_admin";

  // Service role: we only read this company's customers + their portal logins.
  const admin = createServiceRoleClient();
  const [{ data: customers }, { data: links }] = await Promise.all([
    admin
      .from("customers")
      .select("id, code, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name"),
    admin
      .from("customer_users")
      .select("user_id, customer_id")
      .eq("company_id", companyId)
      .is("deleted_at", null),
  ]);

  const userIds = Array.from(new Set((links ?? []).map((l) => l.user_id)));
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, email").in("id", userIds)
    : { data: [] as Array<{ id: string; email: string | null }> };
  const emailById = new Map((profiles ?? []).map((p) => [p.id, p.email]));
  const nameById = new Map((customers ?? []).map((c) => [c.id, c.name]));

  const accounts: BuyerAccount[] = (links ?? []).map((l) => ({
    userId: l.user_id,
    email: emailById.get(l.user_id) ?? "—",
    customerName: nameById.get(l.customer_id) ?? "—",
  }));

  const customerOptions: CustomerOption[] = (customers ?? []).map((c) => ({
    id: c.id,
    label: `${c.code} · ${c.name}`,
  }));

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Eczane Hesapları</h1>
        <p className="text-sm text-muted-foreground">
          Eczane/ecza deposu müşterilerine portal giriş hesabı açın. Bu hesaplar
          ERP&apos;ye giremez; yalnızca katalog + sipariş portalını görür.
        </p>
      </header>

      {customerOptions.length === 0 ? (
        <EmptyState
          title="Önce müşteri ekleyin"
          description="Portal hesabı açmak için Müşteriler bölümünden bir eczane/depo kaydı oluşturun."
        />
      ) : (
        <BuyersAdmin
          companyId={companyId}
          customers={customerOptions}
          accounts={accounts}
          canManage={canManage}
        />
      )}
    </div>
  );
}
