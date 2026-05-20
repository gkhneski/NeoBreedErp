import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ROUTE_LOGIN } from "@/types/roles";

const VALID_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/")) return "/welcome";
  return next;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const next = safeNext(params.get("next"));

  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const typeRaw = params.get("type");

  const supabase = await createServerSupabaseClient();

  if (tokenHash && typeRaw && VALID_OTP_TYPES.has(typeRaw as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      type: typeRaw as EmailOtpType,
      token_hash: tokenHash,
    });
    if (error) {
      return NextResponse.redirect(
        new URL(`${ROUTE_LOGIN}?reason=verify_failed`, url),
      );
    }
    return NextResponse.redirect(new URL(next, url));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`${ROUTE_LOGIN}?reason=callback_failed`, url),
      );
    }
    return NextResponse.redirect(new URL(next, url));
  }

  return NextResponse.redirect(
    new URL(`${ROUTE_LOGIN}?reason=invalid_callback`, url),
  );
}
