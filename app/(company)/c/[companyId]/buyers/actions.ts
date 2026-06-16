"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyUser } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canManageCompanyUsers, companyModulePath } from "@/types/roles";

const inviteSchema = z.object({
  customer_id: z.string().uuid("Müşteri seçin."),
  email: z.string().trim().email("Geçerli bir e-posta girin."),
  password: z.string().min(8, "Şifre en az 8 karakter olmalıdır."),
});

export type BuyerInviteState = {
  error?: string;
  fieldErrors?: Partial<Record<"customer_id" | "email" | "password", string>>;
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

// Staff bir eczane (customer) icin portal giris hesabi acar. Bu kullanici
// company_users'a EKLENMEZ (ERP'ye giremez); yalnizca customer_users uzerinden
// portala baglanir.
export async function inviteBuyer(
  routeCompanyId: string,
  _prev: BuyerInviteState,
  formData: FormData,
): Promise<BuyerInviteState> {
  const { role, companyId } = await requireCompanyUser(routeCompanyId);
  if (!canManageCompanyUsers(role)) {
    return { error: "Bu işlem için firma admini yetkisi gerekir." };
  }

  const parsed = inviteSchema.safeParse({
    customer_id: formData.get("customer_id") ?? "",
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: BuyerInviteState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "customer_id" | "email" | "password";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const admin = createServiceRoleClient();
  const email = parsed.data.email.toLowerCase();

  // Guard: the customer must belong to this company.
  const { data: customer } = await admin
    .from("customers")
    .select("id, company_id, name")
    .eq("id", parsed.data.customer_id)
    .maybeSingle();
  if (!customer || customer.company_id !== companyId) {
    return { error: "Seçilen müşteri bu firmaya ait değil." };
  }

  // A buyer login must not double as ERP staff.
  let userId = await findUserIdByEmail(email);
  let isNew = false;
  if (userId) {
    const { data: staff } = await admin
      .from("company_users")
      .select("user_id")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .limit(1);
    if (staff && staff.length > 0) {
      return {
        error: "Bu e-posta bir personel hesabına ait; alıcı olarak kullanılamaz.",
      };
    }
    const { error: pwError } = await admin.auth.admin.updateUserById(userId, {
      password: parsed.data.password,
    });
    if (pwError) return { error: `Şifre güncellenemedi: ${pwError.message}` };
  } else {
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password: parsed.data.password,
        email_confirm: true,
      });
    if (createError) {
      return { error: `Kullanıcı oluşturulamadı: ${createError.message}` };
    }
    userId = created.user?.id ?? null;
    isNew = true;
    if (!userId) return { error: "Kullanıcı oluşturuldu fakat kimlik alınamadı." };
  }

  await admin.from("profiles").upsert({ id: userId, email });

  const { error: linkError } = await admin.from("customer_users").upsert(
    {
      user_id: userId,
      company_id: companyId,
      customer_id: parsed.data.customer_id,
      deleted_at: null,
    },
    { onConflict: "user_id,company_id" },
  );
  if (linkError) {
    return { error: `Alıcı bağlanamadı: ${linkError.message}` };
  }

  revalidatePath(companyModulePath(companyId, "buyers"));
  return {
    success: isNew
      ? `${customer.name} için portal hesabı oluşturuldu. Hemen giriş yapabilir.`
      : `${customer.name} için mevcut hesap bağlandı, şifresi güncellendi.`,
  };
}

export async function revokeBuyer(
  routeCompanyId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { role, companyId } = await requireCompanyUser(routeCompanyId);
  if (!canManageCompanyUsers(role)) {
    return { ok: false, error: "Yetki yok." };
  }
  if (!z.string().uuid().safeParse(userId).success) {
    return { ok: false, error: "Geçersiz istek." };
  }

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("customer_users")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };

  revalidatePath(companyModulePath(companyId, "buyers"));
  return { ok: true };
}
