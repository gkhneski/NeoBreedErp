"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCompanyUser } from "@/lib/auth";
import {
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

const inviteSchema = z.object({
  email: z.string().trim().email("Geçerli bir e-posta girin."),
  role: z.enum(["company_admin", "company_user"]).default("company_user"),
});

export type CompanyInviteState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "role", string>>;
  success?: string;
};

function readSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL ortam değişkeni tanımlı değil. Davet linki üretilemiyor.",
    );
  }
  return url.replace(/\/$/, "");
}

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

export async function inviteCompanyUser(
  routeCompanyId: string,
  _prev: CompanyInviteState,
  formData: FormData,
): Promise<CompanyInviteState> {
  const { role, companyId } = await requireCompanyUser(routeCompanyId);
  if (role !== "company_admin") {
    return { error: "Bu işlem için firma admini yetkisi gerekir." };
  }

  const parsed = inviteSchema.safeParse({
    email: formData.get("email") ?? "",
    role: (formData.get("role") as string) || "company_user",
  });

  if (!parsed.success) {
    const fieldErrors: CompanyInviteState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "email" | "role";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const { email, role: invitedRole } = parsed.data;
  const redirectTo = `${readSiteUrl()}/auth/callback?next=/welcome`;
  const admin = createServiceRoleClient();

  let userId: string | null = null;
  let invited = false;

  const { data: invitedData, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, { redirectTo });

  if (inviteError) {
    const msg = inviteError.message.toLowerCase();
    const userAlreadyExists =
      msg.includes("already") ||
      msg.includes("registered") ||
      msg.includes("exists");

    if (!userAlreadyExists) {
      return { error: `Davet gönderilemedi: ${inviteError.message}` };
    }

    userId = await findUserIdByEmail(email);
    if (!userId) {
      return {
        error: "E-posta kayıtlı görünüyor fakat kullanıcı bulunamadı.",
      };
    }
  } else {
    userId = invitedData.user?.id ?? null;
    invited = true;
    if (!userId) {
      return { error: "Davet gönderildi fakat kullanıcı kimliği alınamadı." };
    }
  }

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
    success: invited
      ? "Davet gönderildi ve kullanıcı firmaya eklendi."
      : "Kayıtlı kullanıcı firmaya eklendi.",
  };
}
