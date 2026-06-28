import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AccountPartyType,
  AccountTxnKind,
  Database,
} from "@/types/database";

type ServiceClient = SupabaseClient<Database>;

export type PostTxnInput = {
  companyId: string;
  partyType: AccountPartyType;
  partyId: string;
  kind: AccountTxnKind;
  amount: number; // signed delta: +increases balance, -decreases
  currency?: string;
  occurredAt?: string;
  docNo?: string | null;
  docDate?: string | null;
  referenceKind?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
};

export type PostTxnResult =
  | { ok: true; duplicate?: boolean }
  | { ok: false; error: string };

// Posts a single ledger row. Reference-keyed events (sale per order, payable per
// PO) are idempotent: a duplicate is reported ok so callers can post freely.
export async function postAccountTransaction(
  service: ServiceClient,
  input: PostTxnInput,
): Promise<PostTxnResult> {
  const { error } = await service.from("account_transactions").insert({
    company_id: input.companyId,
    party_type: input.partyType,
    party_id: input.partyId,
    kind: input.kind,
    amount: input.amount,
    currency: input.currency ?? "TRY",
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    doc_no: input.docNo ?? null,
    doc_date: input.docDate ?? null,
    reference_kind: input.referenceKind ?? null,
    reference_id: input.referenceId ?? null,
    notes: input.notes ?? null,
    created_by: input.createdBy ?? null,
  });

  if (error) {
    if (error.code === "23505") return { ok: true, duplicate: true };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
