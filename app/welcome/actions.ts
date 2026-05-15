"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getSessionContext, postLoginRedirectFor } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ROUTE_LOGIN } from "@/types/roles";

const schema = z
  .object({
    password: z
      .string()
      .min(10, "Şifre en az 10 karakter olmalı.")
      .max(72, "Şifre en fazla 72 karakter olabilir."),
    confirm: z.string(),
    full_name: z.string().trim().optional().or(z.literal("")),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Şifreler eşleşmiyor.",
  });

export type WelcomeFormState = {
  error?: string;
  fieldErrors?: Partial<Record<"password" | "confirm" | "full_name", string>>;
};

export async function completeWelcome(
  _prev: WelcomeFormState,
  formData: FormData,
): Promise<WelcomeFormState> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`${ROUTE_LOGIN}?reason=session_expired`);

  const parsed = schema.safeParse({
    password: formData.get("password") ?? "",
    confirm: formData.get("confirm") ?? "",
    full_name: formData.get("full_name") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: WelcomeFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "password" | "confirm" | "full_name";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const fullName = parsed.data.full_name?.trim();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
    data: fullName ? { full_name: fullName } : undefined,
  });
  if (error) {
    return { error: error.message };
  }

  if (fullName) {
    await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
  }

  const ctx = await getSessionContext();
  if (!ctx) redirect(`${ROUTE_LOGIN}?reason=session_expired`);
  redirect(postLoginRedirectFor(ctx));
}
