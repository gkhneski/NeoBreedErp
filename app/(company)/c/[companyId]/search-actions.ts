"use server";

import { z } from "zod";

import { requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyModulePath } from "@/types/roles";

export type SearchResult = {
  type: string;
  label: string;
  sub: string;
  href: string;
};

export async function globalSearch(
  companyIdInput: string,
  query: string,
): Promise<SearchResult[]> {
  const companyParsed = z.string().uuid().safeParse(companyIdInput);
  if (!companyParsed.success) return [];

  const term = query.trim().replace(/[%,()*]/g, "").slice(0, 60);
  if (term.length < 2) return [];

  const { companyId } = await requireCompanyUser(companyParsed.data);
  const supabase = await createServerSupabaseClient();
  const like = `%${term}%`;

  const [materials, lots, suppliers, customers, members] = await Promise.all([
    supabase
      .from("materials")
      .select("id, code, name, type")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .or(`name.ilike.${like},code.ilike.${like},barcode.ilike.${like}`)
      .limit(6),
    supabase
      .from("material_lots")
      .select("id, lot_number, materials:material_id!inner(name)")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .ilike("lot_number", like)
      .limit(4)
      .returns<
        Array<{ id: string; lot_number: string; materials: { name: string } }>
      >(),
    supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .or(`name.ilike.${like},code.ilike.${like}`)
      .limit(3),
    supabase
      .from("customers")
      .select("id, code, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .or(`name.ilike.${like},code.ilike.${like}`)
      .limit(3),
    supabase
      .from("company_users")
      .select("user_id")
      .eq("company_id", companyId)
      .is("deleted_at", null),
  ]);

  const results: SearchResult[] = [];

  for (const m of (materials.data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    type: "raw" | "semi" | "finished";
  }>) {
    const finished = m.type === "finished";
    results.push({
      type: finished ? "Ürün" : m.type === "semi" ? "Yarımamül" : "Hammadde",
      label: `${m.code} — ${m.name}`,
      sub: finished ? "Bitmiş ürün" : "Hammadde",
      href: finished
        ? companyModulePath(companyId, "products", m.id)
        : companyModulePath(companyId, "materials", m.id),
    });
  }

  for (const l of lots.data ?? []) {
    results.push({
      type: "Lot",
      label: l.lot_number,
      sub: l.materials?.name ?? "Lot",
      href: companyModulePath(companyId, "lots", l.id),
    });
  }

  for (const s of (suppliers.data ?? []) as Array<{
    code: string;
    name: string;
  }>) {
    results.push({
      type: "Tedarikçi",
      label: `${s.code} — ${s.name}`,
      sub: "Tedarikçi",
      href: companyModulePath(companyId, "suppliers"),
    });
  }

  for (const c of (customers.data ?? []) as Array<{
    code: string;
    name: string;
  }>) {
    results.push({
      type: "Müşteri",
      label: `${c.code} — ${c.name}`,
      sub: "Müşteri",
      href: companyModulePath(companyId, "customers"),
    });
  }

  const memberIds = ((members.data ?? []) as Array<{ user_id: string }>).map(
    (r) => r.user_id,
  );
  if (memberIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("full_name, email")
      .in("id", memberIds)
      .returns<Array<{ full_name: string | null; email: string | null }>>();
    const needle = term.toLocaleLowerCase("tr");
    for (const p of profiles ?? []) {
      const name = p.full_name ?? "";
      const email = p.email ?? "";
      if (
        name.toLocaleLowerCase("tr").includes(needle) ||
        email.toLocaleLowerCase("tr").includes(needle)
      ) {
        results.push({
          type: "Kullanıcı",
          label: name || email,
          sub: email || "Kullanıcı",
          href: companyModulePath(companyId, "users"),
        });
        if (results.filter((r) => r.type === "Kullanıcı").length >= 3) break;
      }
    }
  }

  return results.slice(0, 12);
}
