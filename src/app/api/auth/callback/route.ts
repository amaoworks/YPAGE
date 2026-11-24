import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appOrigin, devAuthBypass } from "@/lib/config";
import { finishOidc, safeNext } from "@/lib/auth/oidc";
import {
  authCookieOptions, issueAuthToken, makeSessionUser, sessionCookie, sessionMaxAge, verifyAuthToken,
} from "@/lib/auth/session";
import { ApiError, api } from "@/lib/http/api";

const flowSchema = z.object({ state: z.string(), nonce: z.string(), verifier: z.string(), next: z.string() });

export const GET = api(async (request) => {
  if (devAuthBypass) return new NextResponse(null, { status: 302, headers: { Location: "/" } });

  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
    throw new ApiError(400, "invalid_oidc_state", "Invalid sign-in state");
  }

  const jar = await cookies();
  const name = `ypage_oidc_${state}`;
  const pending = jar.get(name)?.value;
  if (!pending) throw new ApiError(400, "invalid_oidc_state", "Sign-in request has expired");
  jar.set(name, "", { ...authCookieOptions(), maxAge: 0 });

  const flow = flowSchema.safeParse(await verifyAuthToken("oidc-flow", pending));
  if (!flow.success || flow.data.state !== state) {
    throw new ApiError(400, "invalid_oidc_state", "Invalid sign-in state");
  }
  if (url.searchParams.has("error") || !url.searchParams.get("code")) {
    throw new ApiError(400, "oidc_login_failed", "YPAGE PASS did not authorize this sign-in");
  }

  try {
    const claims = await finishOidc(url.search, flow.data);
    const session = await issueAuthToken("session", makeSessionUser(claims), sessionMaxAge);
    const response = NextResponse.redirect(new URL(safeNext(flow.data.next), appOrigin()), 302);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(sessionCookie, session, { ...authCookieOptions(), maxAge: sessionMaxAge });
    return response;
  } catch (error) {
    console.error("YPAGE OIDC callback failed", { name: error instanceof Error ? error.name : "unknown" });
    throw new ApiError(400, "oidc_login_failed", "Unable to verify YPAGE PASS sign-in");
  }
});
