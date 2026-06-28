import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { requireModuleAccess } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

const tl = (n: number) =>
  `${Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;

type Party = { id: string; code: string; name: string };

export default async function AccountsPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireModuleAccess(routeCompanyId, "accounts");
  const supabase = await createServerSupabaseClient();

  const [{ data: customers }, { data: suppliers }, { data: txns }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, code, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name")
      .returns<Party[]>(),
    supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name")
      .returns<Party[]>(),
    supabase
      .from("account_transactions")
      .select("party_type, party_id, amount")
      .eq("company_id", companyId)
      .returns<Array<{ party_type: "customer" | "supplier"; party_id: string; amount: number }>>(),
  ]);

  const balance = new Map<string, number>();
  for (const t of txns ?? []) {
    const key = `${t.party_type}:${t.party_id}`;
    balance.set(key, (balance.get(key) ?? 0) + Number(t.amount));
  }
  const custBal = (id: string) => balance.get(`customer:${id}`) ?? 0;
  const supBal = (id: string) => balance.get(`supplier:${id}`) ?? 0;

  const totalReceivable = (customers ?? []).reduce((s, c) => s + custBal(c.id), 0);
  const totalPayable = (suppliers ?? []).reduce((s, c) => s + supBal(c.id), 0);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Cari Hesaplar</h1>
        <p className="text-sm text-muted-foreground">
          Müşteri alacakları ve tedarikçi borçları. Bakiye = Σ hareket.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Toplam Alacak (müşteriler)
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{tl(totalReceivable)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Toplam Borç (tedarikçiler)
          </p>
          <p className="mt-1 text-2xl font-bold text-rose-600">{tl(totalPayable)}</p>
        </div>
      </div>

      <PartySection
        title="Müşteriler — Alacaklarımız"
        companyId={companyId}
        partyType="customer"
        rows={(customers ?? []).map((c) => ({ ...c, bal: custBal(c.id) }))}
        positiveLabel="alacak"
      />
      <PartySection
        title="Tedarikçiler — Borçlarımız"
        companyId={companyId}
        partyType="supplier"
        rows={(suppliers ?? []).map((s) => ({ ...s, bal: supBal(s.id) }))}
        positiveLabel="borç"
      />
    </div>
  );
}

function PartySection({
  title,
  companyId,
  partyType,
  rows,
  positiveLabel,
}: {
  title: string;
  companyId: string;
  partyType: "customer" | "supplier";
  rows: Array<{ id: string; code: string; name: string; bal: number }>;
  positiveLabel: string;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <EmptyState title="Kayıt yok" description="Bu kategoride cari yok." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Kod</th>
                <th className="px-3 py-2 text-left">Ad</th>
                <th className="px-3 py-2 text-right">Bakiye</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-secondary/30">
                  <td className="px-3 py-2 font-mono">
                    <Link
                      href={companyModulePath(companyId, "accounts", partyType, r.id)}
                      className="hover:underline"
                    >
                      {r.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${
                      r.bal > 0
                        ? partyType === "customer"
                          ? "text-emerald-600"
                          : "text-rose-600"
                        : "text-muted-foreground"
                    }`}
                  >
                    {Number(r.bal).toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    ₺{r.bal > 0 ? ` ${positiveLabel}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
