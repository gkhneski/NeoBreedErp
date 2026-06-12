"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getSessionContext, postLoginRedirectFor } from "@/lib/auth";
import { isRateLimited, registerFailure } from "@/lib/rate-limit";
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

  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateKey = `login:${ip}:${parsed.data.email.toLowerCase()}`;
  if (isRateLimited(rateKey)) {
    return {
      error: "Çok fazla deneme yapıldı. Lütfen bir dakika sonra tekrar deneyin.",
    };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    registerFailure(rateKey);
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
