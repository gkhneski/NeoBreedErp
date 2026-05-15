import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-xl space-y-6">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Çoklu Firma SaaS ERP
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            NeoBreed-ERP
          </h1>
          <p className="text-sm text-muted-foreground">
            Gıda takviyesi üreticileri için. Her firma; üretim, stok, reçete,
            kalite ve maliyet operasyonlarını kendi yalıtılmış kiracısı
            içinde yürütür.
          </p>
        </div>

        <nav className="flex flex-wrap gap-3 text-sm">
          <Link
            href="/login"
            className="rounded-md border border-border px-3 py-2 hover:bg-secondary"
          >
            Giriş Yap
          </Link>
        </nav>
        <p className="text-xs text-muted-foreground">
          Çalışma alanına ve yönetim paneline giriş yaptıktan sonra yönlendirileceksiniz.
        </p>

        <p className="text-xs text-muted-foreground">
          Faz 2–4: Kimlik doğrulama, çoklu kiracı temeli ve Süper Admin
          konsolu aktif. ERP modülleri Faz 5&apos;te devreye alınacak (bkz.{" "}
          <code>docs/PHASE_PLAN.md</code>).
        </p>
      </div>
    </main>
  );
}
