import { NextResponse } from "next/server";
import { devAuthBypass, oidcIssuer } from "@/lib/config";
import { authCookieOptions, sessionCookie } from "@/lib/auth/session";
import { api, assertSameOrigin, json } from "@/lib/http/api";

export const GET = api((request) => {
  assertSameOrigin(request);
  if (devAuthBypass) return json({ logoutUrl: null });
  const response = NextResponse.redirect(new URL("/logout", oidcIssuer()), 302);
  response.headers.set("Cache-Control", "private, no-store");
  response.cookies.set(sessionCookie, "", { ...authCookieOptions(), maxAge: 0 });
  return response;
});

export const POST = api(() => {
  if (devAuthBypass) return json({ logoutUrl: null });
  const response = NextResponse.json(
    { logoutUrl: new URL("/logout", oidcIssuer()).href },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  response.cookies.set(sessionCookie, "", { ...authCookieOptions(), maxAge: 0 });
  return response;
});
