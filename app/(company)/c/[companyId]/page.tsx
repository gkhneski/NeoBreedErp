import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface CompanyStats {
  totalProducts: number;
  totalMaterials: number;
  criticalStock: number;
  ongoingProduction: number;
  pendingQuality: number;
  openOrders: number;
}

async function loadCompanyStats(_companyId: string): Promise<CompanyStats> {
  return {
    totalProducts: 0,
    totalMaterials: 0,
    criticalStock: 0,
    ongoingProduction: 0,
    pendingQuality: 0,
    openOrders: 0,
  };
}

const QUICK_ACTIONS = [
  { label: "Yeni Üretim Emri", phase: "5c" },
  { label: "Hammadde Girişi", phase: "5b" },
  { label: "Ürün Ekle", phase: "5b" },
  { label: "Reçete Oluştur", phase: "5a" },
  { label: "Kalite Kayıt", phase: "5d" },
  { label: "Sipariş Oluştur", phase: "5+" },
];

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function CompanyDashboardPage({ params }: PageProps) {
  const { companyId: routeCompanyId } = await params;
  const { companyId } = await requireCompanyUser(routeCompanyId);
  const supabase = await createServerSupabaseClient();
  const { data: company } = await supabase
    .from("companies")
    .select("name, status")
    .eq("id", companyId)
    .maybeSingle();

  const stats = await loadCompanyStats(companyId);

  const cards = [
    { label: "Toplam Ürün", value: stats.totalProducts },
    { label: "Toplam Hammadde", value: stats.totalMaterials },
    { label: "Kritik Stok", value: stats.criticalStock },
    { label: "Devam Eden Üretim", value: stats.ongoingProduction },
    { label: "Bekleyen Kalite Kontrol", value: stats.pendingQuality },
    { label: "Açık Siparişler", value: stats.openOrders },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {company?.name ?? "Firma"} · Panel
        </h1>
        <p className="text-sm text-muted-foreground">
          Operasyonel ERP modülleri Faz 5&apos;te aktifleşecek. Tüm veri{" "}
          <code className="font-mono">company_id</code> ile izole edilir.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <article
            key={c.label}
            className="rounded-md border border-border bg-card p-4"
          >
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
              {c.value}
            </p>
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Hızlı İşlemler</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_ACTIONS.map((a) => (
            <article
              key={a.label}
              className="rounded-md border border-border bg-card p-4 opacity-70"
            >
              <p className="text-sm font-medium">{a.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Faz {a.phase}&apos;te aktifleşecek.
              </p>
            </article>
          ))}
        </div>
      </section>

      <EmptyState
        title="Henüz kayıt yok"
        description="Bu panelde firmanızın üretim, stok, kalite ve sipariş özetleri yer alacak. ERP modülleri devreye alındığında gerçek veriler burada görünecek."
      />
    </div>
  );
}
