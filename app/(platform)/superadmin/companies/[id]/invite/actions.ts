"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/auth";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

const schema = z.object({
  company_id: z.string().uuid("Geçersiz firma kimliği."),
  email: z.string().trim().email("Geçerli bir e-posta girin."),
  role: z.enum(["company_admin", "company_user"]).default("company_admin"),
});

export type InviteFormState = {
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
  let page = 1;
  const perPage = 200;
  const needle = email.toLowerCase();
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

export async function inviteCompanyMember(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const ctx = await requirePlatformAdmin();

  const parsed = schema.safeParse({
    company_id: formData.get("company_id") ?? "",
    email: formData.get("email") ?? "",
    role: (formData.get("role") as string) || "company_admin",
  });
  if (!parsed.success) {
    const fieldErrors: InviteFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "email" | "role";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Form alanlarını kontrol edin." };
  }

  const { company_id, email, role } = parsed.data;
  const siteUrl = readSiteUrl();
  const redirectTo = `${siteUrl}/auth/callback?next=/welcome`;

  const admin = createServiceRoleClient();

  let userId: string | null = null;
  let invited = false;

  const { data: invited_data, error: inviteError } =
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
        error: "E-posta zaten kayıtlı görünüyor fakat kullanıcı bulunamadı.",
      };
    }
  } else {
    userId = invited_data.user?.id ?? null;
    invited = true;
    if (!userId) {
      return { error: "Davet gönderildi fakat kullanıcı kimliği alınamadı." };
    }
  }

  const supabase = await createServerSupabaseClient();

  const { error: membershipError } = await supabase
    .from("company_users")
    .upsert(
      { user_id: userId, company_id, role, deleted_at: null },
      { onConflict: "user_id,company_id" },
    );
  if (membershipError) {
    return {
      error: `Kullanıcı firma üyesi yapılamadı: ${membershipError.message}`,
    };
  }

  const { error: auditError } = await supabase.from("platform_audit_log").insert({
    actor_id: ctx.userId,
    action: invited ? "invite_company_member" : "link_existing_user",
    target_table: "company_users",
    target_id: userId,
    diff: { company_id, email, role, invited },
  });
  if (auditError) {
    console.error("[audit] invite_company_member failed", {
      target_id: userId,
      message: auditError.message,
    });
    return {
      error:
        "Üyelik eklendi fakat denetim kaydı yazılamadı. Bir yöneticiye bildirin.",
    };
  }

  revalidatePath(`/superadmin/companies/${company_id}`);
  redirect(`/superadmin/companies/${company_id}?invited=1`);
}
