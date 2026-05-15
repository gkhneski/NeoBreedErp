import { NextResponse, type NextRequest } from "next/server";

import { ROUTE_LOGIN } from "@/types/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/welcome";

  if (!code) {
    return NextResponse.redirect(
      new URL(`${ROUTE_LOGIN}?reason=invalid_callback`, url),
    );
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`${ROUTE_LOGIN}?reason=callback_failed`, url),
    );
  }

  const safeNext = next.startsWith("/") ? next : "/welcome";
  return NextResponse.redirect(new URL(safeNext, url));
}
