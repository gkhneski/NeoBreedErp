import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type AuditRow = {
  id: string;
  actor_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  diff: Record<string, unknown> | null;
  created_at: string;
};

const ACTION_LABEL: Record<string, string> = {
  create_company: "Firma Oluşturuldu",
  set_status_active: "Firma Aktifleştirildi",
  set_status_suspended: "Firma Askıya Alındı",
  set_status_archived: "Firma Arşivlendi",
  invite_company_member: "Üye Davet Edildi",
  link_existing_user: "Mevcut Kullanıcı Bağlandı",
};

function actionVariant(
  action: string,
): "default" | "secondary" | "destructive" | "success" {
  if (action === "set_status_suspended" || action === "set_status_archived") {
    return "destructive";
  }
  if (action === "create_company") return "success";
  return "default";
}

export default async function AuditLogPage() {
  await requirePlatformAdmin();
  const supabase = await createServerSupabaseClient();

  const { data: entries } = await supabase
    .from("platform_audit_log")
    .select("id, actor_id, action, target_table, target_id, diff, created_at")
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<AuditRow[]>();

  const rows = entries ?? [];

  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor_id).filter((id): id is string => !!id)),
  );
  const { data: profiles } =
    actorIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", actorIds)
      : { data: [] as { id: string; full_name: string | null }[] };

  const actorName = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name ?? null]),
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Denetim Kaydı</h1>
        <p className="text-sm text-muted-foreground">
          Platform düzeyindeki yönetim işlemlerinin değiştirilemez kaydı. Son
          200 işlem gösterilir.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="Henüz denetim kaydı yok"
          description="Firma oluşturma, durum değişikliği ve davet işlemleri burada listelenir."
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Tarih</th>
                <th className="px-4 py-2 text-left font-medium">İşlem</th>
                <th className="px-4 py-2 text-left font-medium">Yapan</th>
                <th className="px-4 py-2 text-left font-medium">Hedef</th>
                <th className="px-4 py-2 text-left font-medium">Detay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
                    {formatDateTime(row.created_at)}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={actionVariant(row.action)}>
                      {ACTION_LABEL[row.action] ?? row.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    {row.actor_id
                      ? (actorName.get(row.actor_id) ?? (
                          <span
                            className="font-mono text-xs"
                            title={row.actor_id}
                          >
                            {row.actor_id.slice(0, 8)}…
                          </span>
                        ))
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {row.target_table ? (
                      <span>
                        <span className="text-xs text-muted-foreground">
                          {row.target_table}
                        </span>
                        {row.target_id ? (
                          <span
                            className="ml-1 font-mono text-xs"
                            title={row.target_id}
                          >
                            {row.target_id.slice(0, 8)}…
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {row.diff ? (
                      <code className="block max-w-md break-all font-mono text-xs text-muted-foreground">
                        {JSON.stringify(row.diff)}
                      </code>
                    ) : (
                      "—"
                    )}
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
