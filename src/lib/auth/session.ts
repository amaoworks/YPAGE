import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { appOrigin, devAuthBypass, sessionKey } from "@/lib/config";

export const sessionCookie = "ypage_session";
export const sessionMaxAge = 12 * 60 * 60;

const userSchema = z.object({
  sub: z.string().min(1).max(512),
  name: z.string().max(160),
  username: z.string().max(160).optional(),
  email: z.string().max(254).optional(),
});

const devUser = { sub: "local-development", name: "本地开发", username: "dev" };

export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: appOrigin().startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
  };
}

export async function issueAuthToken(
  purpose: "session" | "oidc-flow",
  claims: Record<string, unknown>,
  maxAge: number,
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(appOrigin())
    .setAudience(`ypage:${purpose}`)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + maxAge)
    .sign(sessionKey());
}

export async function verifyAuthToken(purpose: "session" | "oidc-flow", token: string) {
  const key = sessionKey();
  const issuer = appOrigin();
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer,
      audience: `ypage:${purpose}`,
      algorithms: ["HS256"],
      requiredClaims: ["iat", "exp"],
    });
    return payload;
  } catch {
    return null;
  }
}

export function makeSessionUser(claims: Record<string, unknown>) {
  const displayClaim = (value: unknown, maxLength: number) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : undefined;
  const username = displayClaim(claims.preferred_username, 160);
  return userSchema.parse({
    sub: claims.sub,
    name: displayClaim(claims.name, 160) ?? username ?? "YPAGE PASS",
    username,
    email: displayClaim(claims.email, 254),
  });
}

export async function getCurrentSession(value?: string | null) {
  if (devAuthBypass) return devUser;
  const token = value === undefined ? (await cookies()).get(sessionCookie)?.value : value;
  if (!token) return null;
  const user = userSchema.safeParse(await verifyAuthToken("session", token));
  return user.success ? user.data : null;
}
