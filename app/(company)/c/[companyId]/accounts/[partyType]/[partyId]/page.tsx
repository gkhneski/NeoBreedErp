import Link from "next/link";
import { notFound } from "next/navigation";

import { requireModuleAccess } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AccountTxnKind } from "@/types/database";
import {
  MASTER_DATA_WRITE_ROLES,
  canWriteCompanyData,
  companyModulePath,
} from "@/types/roles";

import { AccountEntryForm } from "./entry-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ companyId: string; partyType: string; partyId: string }>;
}

const tl = (n: number) =>
  `${Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;

const KIND_LABEL: Record<AccountTxnKind, string> = {
  sale: "Satış (borç)",
  purchase: "Alış (borç)",
  payment: "Ödeme",
  adjustment: "Düzeltme",
};

type Txn = {
  id: string;
  kind: AccountTxnKind;
  amount: number;
  occurred_at: string;
  doc_no: string | null;
  doc_date: string | null;
  notes: string | null;
};

export default async function AccountDetailPage({ params }: PageProps) {
  const { companyId: routeCompanyId, partyType, partyId } = await params;
  if (partyType !== "customer" && partyType !== "supplier") notFound();

  const { companyId, role } = await requireModuleAccess(routeCompanyId, "accounts");
  const canWrite = canWriteCompanyData(role, MASTER_DATA_WRITE_ROLES);
  const supabase = await createServerSupabaseClient();

  const table = partyType === "customer" ? "customers" : "suppliers";
  const { data: party } = await supabase
    .from(table)
    .select("id, code, name")
    .eq("id", partyId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; code: string; name: string }>();
  if (!party) notFound();

  const { data: txns } = await supabase
    .from("account_transactions")
    .select("id, kind, amount, occurred_at, doc_no, doc_date, notes")
    .eq("company_id", companyId)
    .eq("party_type", partyType)
    .eq("party_id", partyId)
    .order("occurred_at", { ascending: false })
    .returns<Txn[]>();

  const rows = txns ?? [];
  const balance = rows.reduce((s, t) => s + Number(t.amount), 0);
  const positiveLabel = partyType === "customer" ? "alacak" : "borç";

  return (
    <div className="max-w-4xl space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          <Link href={companyModulePath(companyId, "accounts")} className="hover:underline">
            ← Cari Hesaplar
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {party.code} · {party.name}
        </h1>
        <p className="text-sm">
          Bakiye:{" "}
          <span
            className={`font-bold ${
              balance > 0
                ? partyType === "customer"
                  ? "text-emerald-600"
                  : "text-rose-600"
                : "text-muted-foreground"
            }`}
          >
            {tl(balance)}
            {balance > 0 ? ` ${positiveLabel}` : ""}
          </span>
        </p>
      </header>

      {canWrite ? (
        <AccountEntryForm
          companyId={companyId}
          partyType={partyType}
          partyId={partyId}
        />
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Hareketler</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Henüz hareket yok.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Tarih</th>
                  <th className="px-3 py-2 text-left">Tür</th>
                  <th className="px-3 py-2 text-left">Dekont</th>
                  <th className="px-3 py-2 text-right">Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2 text-muted-foreground">
                      {(t.doc_date ?? t.occurred_at).slice(0, 10)}
                    </td>
                    <td className="px-3 py-2">{KIND_LABEL[t.kind]}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {t.doc_no ?? "—"}
                      {t.notes ? ` · ${t.notes}` : ""}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-semibold tabular-nums ${
                        Number(t.amount) < 0 ? "text-emerald-600" : ""
                      }`}
                    >
                      {tl(Number(t.amount))}
                    </td>
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
