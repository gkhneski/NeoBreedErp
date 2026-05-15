import Link from "next/link";
import { notFound } from "next/navigation";

import { requirePlatformAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { InviteForm } from "./invite-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InviteMemberPage({ params }: PageProps) {
  await requirePlatformAdmin();
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, contact_email, deleted_at")
    .eq("id", id)
    .maybeSingle();

  if (!company || company.deleted_at) notFound();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href="/superadmin/companies" className="hover:text-foreground">
            Firmalar
          </Link>{" "}
          /{" "}
          <Link
            href={`/superadmin/companies/${company.id}`}
            className="hover:text-foreground"
          >
            {company.name}
          </Link>{" "}
          / Üye Davet Et
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Üye Davet Et
        </h1>
      </div>

      <section className="max-w-xl rounded-md border border-border bg-card p-4">
        <InviteForm
          companyId={company.id}
          companyName={company.name}
          defaultEmail={company.contact_email}
        />
      </section>
    </div>
  );
}
