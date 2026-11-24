import { NextResponse } from "next/server";
import { appOrigin, devAuthBypass } from "@/lib/config";
import { safeNext, startOidc } from "@/lib/auth/oidc";
import { authCookieOptions, getCurrentSession, issueAuthToken } from "@/lib/auth/session";
import { ApiError, api } from "@/lib/http/api";

export const GET = api(async (request) => {
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  if (devAuthBypass || await getCurrentSession()) {
    return new NextResponse(null, { status: 302, headers: { Location: next, "Cache-Control": "private, no-store" } });
  }
  const origin = appOrigin();
  try {
    const { url, flow } = await startOidc(next);
    const maxAge = 300;
    const signed = await issueAuthToken("oidc-flow", flow, maxAge);
    const response = NextResponse.redirect(url, 302);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(`ypage_oidc_${flow.state}`, signed, { ...authCookieOptions(), maxAge });
    return response;
  } catch (error) {
    console.error("YPAGE OIDC login failed", { origin, error: error instanceof Error ? error.name : "unknown" });
    throw new ApiError(502, "oidc_unavailable", "Unable to start YPAGE PASS sign-in");
  }
});
