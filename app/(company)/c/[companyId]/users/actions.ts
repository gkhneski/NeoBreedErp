"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyUser } from "@/lib/auth";
import { authAcceptRedirectUrl } from "@/lib/site-url";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  COMPANY_ROLE_VALUES,
  canManageCompanyUsers,
  companyModulePath,
  type CompanyRole,
} from "@/types/roles";

const inviteSchema = z.object({
  full_name: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().trim().email("Geçerli bir e-posta girin."),
  password: z.string().min(8, "Şifre en az 8 karakter olmalıdır."),
  role: z.enum(COMPANY_ROLE_VALUES).default("viewer"),
});

export type CompanyInviteState = {
  error?: string;
  fieldErrors?: Partial<Record<"full_name" | "email" | "password" | "role", string>>;
  success?: string;
};

async function findUserIdByEmail(email: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  const needle = email.toLowerCase();
  let page = 1;
  const perPage = 200;

  while (page < 50) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);

    const hit = data.users.find((u) => u.email?.toLowerCase() === needle);
    if (hit) return hit.id;
    if (data.users.length < perPage) return null;
    page += 1;
  }

  return null;
}

async function ensureProfile(args: {
  userId: string;
  email: string;
  fullName: string | null;
}) {
  const admin = createServiceRoleClient();
  const { userId, email, fullName } = args;

  const { data: existing } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("id", userId)
    .maybeSingle();

  const profile = {
    id: userId,
    email: email.toLowerCase(),
    full_name: fullName ?? existing?.full_name ?? null,
  };

  const { error } = await admin.from("profiles").upsert(profile);
  if (error) throw new Error(error.message);
}

export async function inviteCompanyUser(
  routeCompanyId: string,
  _prev: CompanyInviteState,
  formData: FormData,
): Promise<CompanyInviteState> {
  const { role, companyId } = await requireCompanyUser(routeCompanyId);
  if (!canManageCompanyUsers(role)) {
    return { error: "Bu işlem için firma admini yetkisi gerekir." };
  }

  const parsed = inviteSchema.safeParse({
    full_name: formData.get("full_name") ?? "",
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    role: (formData.get("role") as string) || "viewer",
  });

  if (!parsed.success) {
    const fieldErrors: CompanyInviteState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "full_name" | "email" | "password" | "role";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const email = parsed.data.email.toLowerCase();
  const fullName = parsed.data.full_name?.trim() || null;
  const { role: invitedRole, password } = parsed.data;
  const admin = createServiceRoleClient();

  let userId: string | null = await findUserIdByEmail(email);
  let isNew = false;

  if (!userId) {
    // New user — create immediately, email already confirmed, no verification email.
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          ...(fullName ? { full_name: fullName } : {}),
        },
      });

    if (createError) {
      return { error: `Kullanıcı oluşturulamadı: ${createError.message}` };
    }

    userId = created.user?.id ?? null;
    isNew = true;
    if (!userId) {
      return { error: "Kullanıcı oluşturuldu fakat kimlik alınamadı." };
    }
  } else {
    // Existing user — update their password so they can log in with the new one.
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password,
    });
    if (updateError) {
      return { error: `Şifre güncellenemedi: ${updateError.message}` };
    }
  }

  await ensureProfile({ userId, email, fullName });

  const { error: membershipError } = await admin.from("company_users").upsert(
    {
      user_id: userId,
      company_id: companyId,
      role: invitedRole,
      deleted_at: null,
    },
    { onConflict: "user_id,company_id" },
  );

  if (membershipError) {
    return {
      error: `Kullanıcı firma üyesi yapılamadı: ${membershipError.message}`,
    };
  }

  revalidatePath(companyModulePath(companyId, "users"));
  return {
    success: isNew
      ? "Kullanıcı oluşturuldu ve firmaya eklendi. Hemen giriş yapabilir."
      : "Mevcut kullanıcı firmaya eklendi, şifresi güncellendi.",
  };
}

export type ChangeRoleState = {
  error?: string;
  success?: string;
};

export async function changeUserRole(
  routeCompanyId: string,
  userId: string,
  _prev: ChangeRoleState,
  formData: FormData,
): Promise<ChangeRoleState> {
  const { role, companyId } = await requireCompanyUser(routeCompanyId);
  if (!canManageCompanyUsers(role)) {
    return { error: "Bu işlem için firma admini yetkisi gerekir." };
  }

  const newRole = formData.get("role") as string;
  if (!COMPANY_ROLE_VALUES.includes(newRole as never)) {
    return { error: "Geçersiz rol." };
  }

  const admin = createServiceRoleClient();

  const { data: membership } = await admin
    .from("company_users")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!membership) {
    return { error: "Kullanıcı bu firmaya ait değil." };
  }

  const { error: updateError } = await admin
    .from("company_users")
    .update({ role: newRole as CompanyRole })
    .eq("company_id", companyId)
    .eq("user_id", userId);

  if (updateError) {
    return { error: updateError.message };
  }

  revalidatePath(companyModulePath(companyId, "users"));
  return { success: "Rol güncellendi." };
}

export type ResendPasswordState = {
  error?: string;
  success?: string;
};

export async function resendWelcomeEmail(
  routeCompanyId: string,
  userId: string,
  _prev: ResendPasswordState,
): Promise<ResendPasswordState> {
  const { role, companyId } = await requireCompanyUser(routeCompanyId);
  if (!canManageCompanyUsers(role)) {
    return { error: "Bu işlem için firma admini yetkisi gerekir." };
  }

  const admin = createServiceRoleClient();
  const { data: membership } = await admin
    .from("company_users")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!membership) {
    return { error: "Kullanıcı bu firmaya ait değil." };
  }

  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user?.email) {
    return { error: error?.message ?? "Kullanıcı e-postası bulunamadı." };
  }

  const { error: resetError } = await admin.auth.resetPasswordForEmail(
    data.user.email,
    { redirectTo: authAcceptRedirectUrl() },
  );
  if (resetError) {
    return { error: resetError.message };
  }

  revalidatePath(companyModulePath(companyId, "users"));
  return { success: "Şifre sıfırlama bağlantısı e-posta ile gönderildi." };
}
