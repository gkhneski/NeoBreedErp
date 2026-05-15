import { EmptyState } from "@/components/ui/empty-state";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function SubscriptionsPage() {
  await requirePlatformAdmin();
  const supabase = await createServerSupabaseClient();
  const { data: packages } = await supabase
    .from("packages")
    .select("id, name, description, user_limit, feature_flags, created_at")
    .order("name");

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Abonelikler</h1>
        <p className="text-sm text-muted-foreground">
          Paketler firmalara atanan plan şablonlarıdır. Ödeme entegrasyonu MVP
          kapsamı dışında.
        </p>
      </header>

      {!packages || packages.length === 0 ? (
        <EmptyState
          title="Henüz paket yok"
          description="Paket tanımları Faz 4 sonunda admin arayüzünden eklenecek. Şimdilik veritabanına manuel olarak eklenebilir."
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Paket</th>
                <th className="px-4 py-2 text-left font-medium">Açıklama</th>
                <th className="px-4 py-2 text-left font-medium">
                  Kullanıcı Limiti
                </th>
                <th className="px-4 py-2 text-left font-medium">Oluşturulma</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {packages.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {p.description ?? "—"}
                  </td>
                  <td className="px-4 py-2 tabular-nums">{p.user_limit}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatDate(p.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
