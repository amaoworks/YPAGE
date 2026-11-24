export const devAuthBypass =
  process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "true";

export const oidcScope = "openid profile email groups";
export const callbackPath = "/api/auth/callback";

function required(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value;
}

function serviceOrigin(name: string): string {
  const url = new URL(required(name));
  const localHttp =
    process.env.NODE_ENV !== "production" &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !localHttp) ||
    url.href !== url.origin + "/"
  ) {
    throw new Error(`${name} must be an HTTPS origin`);
  }
  return url.origin;
}

export function appOrigin(): string {
  return serviceOrigin("YPAGE_URL");
}

export function oidcIssuer(): string {
  return serviceOrigin("OIDC_ISSUER");
}

export function oidcCredentials() {
  return {
    clientId: required("OIDC_CLIENT_ID"),
    clientSecret: required("OIDC_CLIENT_SECRET"),
  };
}

export function sessionKey(): Uint8Array {
  const key = new TextEncoder().encode(required("SESSION_SECRET"));
  if (key.byteLength < 32) throw new Error("SESSION_SECRET must be at least 32 bytes");
  return key;
}

export function publicOidc(brandName: string) {
  const issuer = process.env.OIDC_ISSUER?.trim() || !devAuthBypass ? oidcIssuer() : null;
  return {
    brandName,
    issuer,
    discoveryUrl: issuer ? issuer + "/.well-known/openid-configuration" : null,
    scope: oidcScope,
  };
}
