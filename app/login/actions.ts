"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getSessionContext, postLoginRedirectFor } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().email("Geçerli bir e-posta adresi girin."),
  password: z.string().min(1, "Şifre boş bırakılamaz."),
});

export type LoginState = {
  error?: string;
};

export async function signIn(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz giriş." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    return { error: "E-posta veya şifre hatalı." };
  }

  const ctx = await getSessionContext();
  if (!ctx) {
    return { error: "Oturum oluşturulamadı." };
  }
  redirect(postLoginRedirectFor(ctx));
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}
