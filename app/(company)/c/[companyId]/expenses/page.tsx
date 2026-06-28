import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ExpenseCategory } from "@/types/database";
import {
  MASTER_DATA_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

import {
  CATEGORY_LABEL,
  DeleteExpenseButton,
  ExpenseForm,
  type ExpenseCat,
} from "./expenses-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

const tl = (n: number) =>
  `${Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;

type Row = {
  id: string;
  category: ExpenseCategory;
  amount: number;
  period_month: string;
  notes: string | null;
};

export default async function ExpensesPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId, role } = await requireModuleAccess(routeCompanyId, "expenses");
  const canWrite = canWriteCompanyData(role, MASTER_DATA_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("company_expenses")
    .select("id, category, amount, period_month, notes")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("period_month", { ascending: false })
    .returns<Row[]>();

  const rows = data ?? [];
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Genel Giderler</h1>
          <p className="text-sm text-muted-foreground">
            Maaş, elektrik, su, akaryakıt, kira… Ürün maliyetine üretilen kutu
            başına dağıtılır (Karlılık raporu).
          </p>
        </div>
        <Link href={companyModulePath(companyId, "reports", "profitability")}>
          <Button variant="outline">Karlılık Raporu</Button>
        </Link>
      </header>

      {canWrite ? <ExpenseForm companyId={companyId} /> : null}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Kayıtlar</h2>
          <span className="text-sm text-muted-foreground">Toplam: {tl(total)}</span>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Henüz gider girilmedi.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Ay</th>
                  <th className="px-3 py-2 text-left">Kategori</th>
                  <th className="px-3 py-2 text-left">Açıklama</th>
                  <th className="px-3 py-2 text-right">Tutar</th>
                  {canWrite ? <th className="px-3 py-2" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.period_month.slice(0, 7)}
                    </td>
                    <td className="px-3 py-2">{CATEGORY_LABEL[r.category as ExpenseCat]}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.notes ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {tl(Number(r.amount))}
                    </td>
                    {canWrite ? (
                      <td className="px-3 py-2 text-right">
                        <DeleteExpenseButton companyId={companyId} expenseId={r.id} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
