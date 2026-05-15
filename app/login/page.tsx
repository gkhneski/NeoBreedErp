import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionContext, postLoginRedirectFor } from "@/lib/auth";

import { LoginForm } from "./login-form";

interface LoginPageProps {
  searchParams: Promise<{ reason?: string }>;
}

const REASON_MESSAGES: Record<string, string> = {
  no_company:
    "Bu hesap herhangi bir firmaya bağlı değil. Lütfen platform yöneticinizle iletişime geçin.",
  no_role:
    "Bu hesap için tanımlı bir rol yok. Lütfen platform yöneticinizle iletişime geçin.",
  forbidden: "Bu alana erişim yetkiniz yok.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const ctx = await getSessionContext();
  if (ctx) {
    redirect(postLoginRedirectFor(ctx));
  }

  const { reason } = await searchParams;
  const reasonMessage = reason ? REASON_MESSAGES[reason] : undefined;

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <Link
            href="/"
            className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            NeoBreed-ERP
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Giriş Yap</h1>
          <p className="text-sm text-muted-foreground">
            Hem Süper Admin hem firma kullanıcıları aynı formdan giriş yapar.
            Rolünüze göre doğru panele yönlendirilirsiniz.
          </p>
        </div>

        {reasonMessage ? (
          <p className="rounded-md border border-amber-300/40 bg-amber-100/50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-200">
            {reasonMessage}
          </p>
        ) : null}

        <LoginForm />
      </div>
    </main>
  );
}
