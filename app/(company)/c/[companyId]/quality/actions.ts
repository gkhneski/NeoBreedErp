"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

const codeRegex = /^[A-Za-z0-9._\-/]+$/;

const checklistItemSchema = z.object({
  spec_name: z
    .string()
    .trim()
    .min(1, "Spec adı gerekli.")
    .max(200, "Spec adı en fazla 200 karakter olabilir."),
  spec_target: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

const createSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "QC kodu gerekli.")
      .max(64, "Kod en fazla 64 karakter olabilir.")
      .regex(
        codeRegex,
        "Kod yalnızca harf, rakam, nokta, tire, alt çizgi ve eğik çizgi içerebilir.",
      ),
    subject_kind: z.enum(["material_lot", "production_batch"]),
    subject_id: z.string().uuid({ message: "Konu seçiniz." }),
    items: z
      .array(checklistItemSchema)
      .min(1, "En az bir kontrol kalemi gerekli.")
      .max(50, "En fazla 50 kalem girilebilir."),
    notes: z.string().trim().max(2000).optional(),
  });

export type CreateQualityCheckState = {
  error?: string;
  fieldErrors?: {
    code?: string;
    subject_id?: string;
    subject_kind?: string;
    items?: Record<string, string>;
  };
};

function parseItemsFromForm(formData: FormData) {
  const names = formData.getAll("spec_name").map((v) => String(v));
  const targets = formData.getAll("spec_target").map((v) => String(v));
  return names.map((spec_name, idx) => ({
    spec_name,
    spec_target: targets[idx] ?? "",
  }));
}

function emptyToNull(v: string | undefined | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function createQualityCheck(
  routeCompanyId: string,
  _prev: CreateQualityCheckState,
  formData: FormData,
): Promise<CreateQualityCheckState> {
  const parsed = createSchema.safeParse({
    code: formData.get("code") ?? "",
    subject_kind: formData.get("subject_kind") ?? "",
    subject_id: formData.get("subject_id") ?? "",
    items: parseItemsFromForm(formData),
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: CreateQualityCheckState["fieldErrors"] = { items: {} };
    for (const issue of parsed.error.issues) {
      const [head, idx, sub] = issue.path;
      if (head === "items" && typeof idx === "number") {
        fieldErrors.items![`${idx}.${String(sub ?? "row")}`] = issue.message;
      } else if (head === "code") {
        fieldErrors.code = issue.message;
      } else if (head === "subject_id") {
        fieldErrors.subject_id = issue.message;
      } else if (head === "subject_kind") {
        fieldErrors.subject_kind = issue.message;
      }
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const { ctx, companyId } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  if (parsed.data.subject_kind === "material_lot") {
    const { data: lot } = await supabase
      .from("material_lots")
      .select("id, company_id, status, deleted_at")
      .eq("id", parsed.data.subject_id)
      .maybeSingle();
    if (!lot || lot.company_id !== companyId || lot.deleted_at) {
      return {
        fieldErrors: { subject_id: "Lot bulunamadı." },
        error: "Geçersiz konu.",
      };
    }
    if (lot.status !== "quarantine") {
      return {
        fieldErrors: {
          subject_id: "Yalnızca karantinadaki lot için QC açılabilir.",
        },
        error: "Lot karantinada değil.",
      };
    }
  } else {
    const { data: batch } = await supabase
      .from("production_batches")
      .select("id, company_id, status, output_lot_id, deleted_at")
      .eq("id", parsed.data.subject_id)
      .maybeSingle();
    if (!batch || batch.company_id !== companyId || batch.deleted_at) {
      return {
        fieldErrors: { subject_id: "Parti bulunamadı." },
        error: "Geçersiz konu.",
      };
    }
    if (batch.status !== "completed") {
      return {
        fieldErrors: {
          subject_id: "Yalnızca tamamlanmış parti için QC açılabilir.",
        },
        error: "Parti tamamlanmış değil.",
      };
    }
    if (!batch.output_lot_id) {
      return {
        fieldErrors: { subject_id: "Partinin çıkış lotu yok." },
        error: "Geçersiz parti.",
      };
    }
  }

  const insertPayload: {
    company_id: string;
    code: string;
    subject_kind: "material_lot" | "production_batch";
    material_lot_id: string | null;
    production_batch_id: string | null;
    notes: string | null;
    created_by: string;
    updated_by: string;
  } = {
    company_id: companyId,
    code: parsed.data.code,
    subject_kind: parsed.data.subject_kind,
    material_lot_id:
      parsed.data.subject_kind === "material_lot"
        ? parsed.data.subject_id
        : null,
    production_batch_id:
      parsed.data.subject_kind === "production_batch"
        ? parsed.data.subject_id
        : null,
    notes: emptyToNull(parsed.data.notes),
    created_by: ctx.userId,
    updated_by: ctx.userId,
  };

  const { data: check, error: checkError } = await supabase
    .from("quality_checks")
    .insert(insertPayload)
    .select("id")
    .single();

  if (checkError || !check) {
    if (checkError?.code === "23505") {
      return {
        error: "Bu QC kodu zaten kullanılmış.",
        fieldErrors: { code: "Kod benzersiz olmalı." },
      };
    }
    if (checkError?.code === "23514") {
      return { error: checkError.message };
    }
    return { error: checkError?.message ?? "QC kaydı oluşturulamadı." };
  }

  const rows = parsed.data.items.map((it, idx) => ({
    company_id: companyId,
    quality_check_id: check.id,
    position: idx + 1,
    spec_name: it.spec_name,
    spec_target: it.spec_target,
  }));

  const { error: rowError } = await supabase
    .from("quality_check_results")
    .insert(rows);

  if (rowError) {
    return { error: rowError.message };
  }

  revalidatePath(companyModulePath(companyId, "quality"));
  redirect(companyModulePath(companyId, "quality", check.id));
}

const resultEntrySchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  spec_name: z.string().trim().min(1).max(200),
  spec_target: z.string().trim().max(200).optional(),
  measured_value: z.string().trim().max(500).optional(),
  verdict: z.enum(["pending", "pass", "fail", "na"]),
  notes: z.string().trim().max(1000).optional(),
});

const saveResultsSchema = z.object({
  check_id: z.string().uuid(),
  items: z.array(resultEntrySchema).min(1, "En az bir kalem gerekli."),
});

export type SaveResultsState = {
  error?: string;
  fieldErrors?: {
    items?: Record<string, string>;
  };
  message?: string;
};

export async function saveQualityCheckResults(
  routeCompanyId: string,
  _prev: SaveResultsState,
  formData: FormData,
): Promise<SaveResultsState> {
  const ids = formData.getAll("row_id").map((v) => String(v));
  const names = formData.getAll("spec_name").map((v) => String(v));
  const targets = formData.getAll("spec_target").map((v) => String(v));
  const measured = formData.getAll("measured_value").map((v) => String(v));
  const verdicts = formData.getAll("verdict").map((v) => String(v));
  const notesList = formData.getAll("row_notes").map((v) => String(v));

  const items = names.map((spec_name, idx) => ({
    id: ids[idx] ?? "",
    spec_name,
    spec_target: targets[idx] ?? "",
    measured_value: measured[idx] ?? "",
    verdict: verdicts[idx] ?? "pending",
    notes: notesList[idx] ?? "",
  }));

  const parsed = saveResultsSchema.safeParse({
    check_id: formData.get("check_id") ?? "",
    items,
  });

  if (!parsed.success) {
    const fieldErrors: SaveResultsState["fieldErrors"] = { items: {} };
    for (const issue of parsed.error.issues) {
      const [head, idx, sub] = issue.path;
      if (head === "items" && typeof idx === "number") {
        fieldErrors.items![`${idx}.${String(sub ?? "row")}`] = issue.message;
      }
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const { companyId } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const { data: check } = await supabase
    .from("quality_checks")
    .select("id, company_id, status")
    .eq("id", parsed.data.check_id)
    .maybeSingle();

  if (!check || check.company_id !== companyId) {
    return { error: "QC kaydı bulunamadı." };
  }
  if (check.status !== "draft") {
    return { error: "Yalnızca taslak QC düzenlenebilir." };
  }

  // Replace-all strategy: easiest correctness model for a draft.
  // Cascade-safe because deletion order: child rows first under a draft parent.
  const { error: delError } = await supabase
    .from("quality_check_results")
    .delete()
    .eq("quality_check_id", check.id)
    .eq("company_id", companyId);

  if (delError) {
    if (delError.code === "23514") {
      return { error: "QC kaydı taslak değil; sonuçlar dondurulmuş." };
    }
    return { error: delError.message };
  }

  const rows = parsed.data.items.map((it, idx) => ({
    company_id: companyId,
    quality_check_id: check.id,
    position: idx + 1,
    spec_name: it.spec_name,
    spec_target: emptyToNull(it.spec_target),
    measured_value: emptyToNull(it.measured_value),
    verdict: it.verdict,
    notes: emptyToNull(it.notes),
  }));

  const { error: insError } = await supabase
    .from("quality_check_results")
    .insert(rows);

  if (insError) {
    return { error: insError.message };
  }

  revalidatePath(companyModulePath(companyId, "quality", check.id));
  return { message: "Kaydedildi." };
}

const signSchema = z.object({
  check_id: z.string().uuid(),
  overall_verdict: z.enum(["passed", "failed"]),
});

export type SignQualityCheckState = {
  error?: string;
};

export async function signQualityCheck(
  routeCompanyId: string,
  _prev: SignQualityCheckState,
  formData: FormData,
): Promise<SignQualityCheckState> {
  const parsed = signSchema.safeParse({
    check_id: formData.get("check_id") ?? "",
    overall_verdict: formData.get("overall_verdict") ?? "",
  });

  if (!parsed.success) {
    return { error: "Geçersiz onay isteği." };
  }

  const { companyId } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("sign_quality_check", {
    p_company_id: companyId,
    p_check_id: parsed.data.check_id,
    p_overall_verdict: parsed.data.overall_verdict,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(companyModulePath(companyId, "quality"));
  revalidatePath(companyModulePath(companyId, "quality", parsed.data.check_id));
  revalidatePath(companyModulePath(companyId, "lots"));
  revalidatePath(companyModulePath(companyId, "production"));
  return {};
}

const cancelSchema = z.object({
  check_id: z.string().uuid(),
});

export async function cancelQualityCheck(
  routeCompanyId: string,
  formData: FormData,
): Promise<void> {
  const parsed = cancelSchema.safeParse({
    check_id: formData.get("check_id") ?? "",
  });
  if (!parsed.success) return;

  const { companyId } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("cancel_quality_check", {
    p_company_id: companyId,
    p_check_id: parsed.data.check_id,
  });

  if (error) throw new Error(error.message);

  revalidatePath(companyModulePath(companyId, "quality"));
  revalidatePath(companyModulePath(companyId, "quality", parsed.data.check_id));
}
