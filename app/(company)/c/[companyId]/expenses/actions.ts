"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MASTER_DATA_WRITE_ROLES, companyModulePath } from "@/types/roles";

export type ExpenseActionResult = { ok: true; note?: string } | { ok: false; error: string };

const expenseSchema = z.object({
  company: z.string().uuid(),
  category: z.enum(["salary", "electricity", "water", "fuel", "rent", "other"]),
  amount: z.number().positive("Tutar pozitif olmalı."),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Ay seçin (yyyy-aa)."),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function addExpense(input: {
  company: string;
  category: "salary" | "electricity" | "water" | "fuel" | "rent" | "other";
  amount: number;
  month: string;
  notes: string;
}): Promise<ExpenseActionResult> {
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Geçersiz giriş." };
  }
  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.from("company_expenses").insert({
    company_id: companyId,
    category: parsed.data.category,
    amount: parsed.data.amount,
    period_month: `${parsed.data.month}-01`,
    notes: parsed.data.notes || null,
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(companyModulePath(companyId, "expenses"));
  revalidatePath(companyModulePath(companyId, "reports", "profitability"));
  return { ok: true, note: "Gider eklendi." };
}

export async function deleteExpense(
  companyIdInput: string,
  expenseIdInput: string,
): Promise<ExpenseActionResult> {
  const parsed = z
    .object({ company: z.string().uuid(), expense: z.string().uuid() })
    .safeParse({ company: companyIdInput, expense: expenseIdInput });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const { ctx, companyId } = await requireCompanyRole(
    parsed.data.company,
    MASTER_DATA_WRITE_ROLES,
  );
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("company_expenses")
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq("id", parsed.data.expense)
    .eq("company_id", companyId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(companyModulePath(companyId, "expenses"));
  return { ok: true, note: "Gider silindi." };
}
