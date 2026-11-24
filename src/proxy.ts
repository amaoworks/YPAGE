import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, sessionCookie } from "@/lib/auth/session";
import { appOrigin } from "@/lib/config";
import { unauthorized } from "@/lib/http/api";

const publicApi = new Set([
  "/api/health",
  "/api/auth/login",
  "/api/auth/callback",
  "/api/auth/logout",
]);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (publicApi.has(pathname)) return NextResponse.next();
  const user = await getCurrentSession(request.cookies.get(sessionCookie)?.value ?? null);
  if (!user) {
    if (pathname === "/api" || pathname.startsWith("/api/")) return unauthorized();
    const params = new URLSearchParams({ next: pathname + search });
    const response = NextResponse.redirect(new URL(`/api/auth/login?${params}`, appOrigin()), 302);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon\\.svg|favicon\\.ico|robots\\.txt).*)"],
};
