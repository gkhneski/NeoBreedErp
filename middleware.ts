import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PREFIXES = ["/login", "/auth"];
const PUBLIC_EXACT = new Set(["/"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(request: NextRequest) {
  const { response, supabase, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return response;
  }

  const isPlatformRoute = pathname.startsWith("/superadmin");
  const isCompanyRoute = pathname.startsWith("/app");
  if (!isPlatformRoute && !isCompanyRoute) {
    return response;
  }

  if (!user || !supabase) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (isPlatformRoute) {
    const { data: platformRow } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!platformRow) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("reason", "forbidden");
      return NextResponse.redirect(url);
    }
  }

  if (isCompanyRoute) {
    const { data: membership } = await supabase
      .from("company_users")
      .select("company_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (!membership) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("reason", "no_company");
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
