import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PREFIXES = ["/login", "/auth"];
const PUBLIC_EXACT = new Set(["/"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return response;
  }

  const isPlatformRoute = pathname.startsWith("/superadmin");
  const isCompanyRoute = pathname.startsWith("/c/");
  const isPortalRoute = pathname.startsWith("/portal");
  if (!isPlatformRoute && !isCompanyRoute && !isPortalRoute) {
    return response;
  }

  // Rol/uyelik kontrolu burada degil: requirePlatformAdmin /
  // requireCompanyUser (server) + RLS (DB) zaten zorunlu kiliyor.
  // Middleware sadece oturum tazeler ve oturumsuz istegi login'e atar.
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
