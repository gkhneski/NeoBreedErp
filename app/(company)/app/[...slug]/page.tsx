import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyUser } from "@/lib/auth";

const MODULE_LABELS: Record<string, { title: string; phase: string }> = {
  products: { title: "Ürünler", phase: "5b" },
  materials: { title: "Hammaddeler", phase: "5b" },
  stock: { title: "Stok", phase: "5b" },
  recipes: { title: "Reçeteler", phase: "5a" },
  production: { title: "Üretim", phase: "5c" },
  quality: { title: "Kalite Kontrol", phase: "5d" },
  warehouse: { title: "Depo Hareketleri", phase: "5b" },
  orders: { title: "Siparişler", phase: "5+" },
  reports: { title: "Raporlar", phase: "5+" },
  users: { title: "Kullanıcılar", phase: "3-4" },
  settings: { title: "Ayarlar", phase: "3-4" },
};

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export default async function CompanyModulePlaceholderPage({ params }: PageProps) {
  await requireCompanyUser();
  const { slug } = await params;
  const top = slug?.[0] ?? "";
  const meta = MODULE_LABELS[top] ?? { title: top || "Modül", phase: "5+" };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{meta.title}</h1>
        <p className="text-sm text-muted-foreground">
          Bu modül henüz uygulanmadı. Faz {meta.phase} kapsamında devreye
          alınacak.
        </p>
      </header>

      <EmptyState
        title="Yapım aşamasında"
        description="Bu sayfa Faz 5 sub-fazlarında implemente edilecek. O zamana kadar firma veri yapısı sağlamlaştırılır ve izolasyon doğrulanır."
      />
    </div>
  );
}
