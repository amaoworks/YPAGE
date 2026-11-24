import * as client from "openid-client";
import { appOrigin, callbackPath, oidcCredentials, oidcIssuer, oidcScope } from "@/lib/config";

let discovery: Promise<client.Configuration> | undefined;

export function getOidcConfiguration(): Promise<client.Configuration> {
  if (!discovery) {
    const issuer = oidcIssuer();
    const { clientId, clientSecret } = oidcCredentials();
    const execute = [client.enableNonRepudiationChecks];
    if (issuer.startsWith("http:")) execute.push(client.allowInsecureRequests);
    discovery = client
      .discovery(new URL(issuer), clientId, { client_secret: clientSecret, id_token_signed_response_alg: "RS256" },
        client.ClientSecretPost(clientSecret), { timeout: 8, execute })
      .catch((error: unknown) => {
        discovery = undefined;
        throw error;
      });
  }
  return discovery;
}

export function safeNext(value: string | null): string {
  if (!value || value.length > 500) return "/";
  try {
    const path = decodeURIComponent(value.split(/[?#]/, 1)[0]);
    if (!path.startsWith("/") || path.startsWith("//") || /[\\\x00-\x1f\x7f]/.test(path)) return "/";
    const base = "https://ypage.invalid";
    const parsed = new URL(value, base);
    const normalized = new URL(path, base);
    if (parsed.origin !== base || normalized.origin !== base) return "/";
    if ([parsed, normalized].some((url) => url.pathname.startsWith("//") || url.pathname === "/api" || url.pathname.startsWith("/api/"))) return "/";
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return "/";
  }
}

export async function startOidc(next: string) {
  const config = await getOidcConfiguration();
  const verifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const nonce = client.randomNonce();

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: appOrigin() + callbackPath,
    scope: oidcScope,
    code_challenge: await client.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
    state,
    nonce,
  });
  return { url, flow: { state, nonce, verifier, next } };
}

export async function finishOidc(search: string, flow: { state: string; nonce: string; verifier: string }) {
  const config = await getOidcConfiguration();
  const tokens = await client.authorizationCodeGrant(config, new URL(appOrigin() + callbackPath + search), {
    pkceCodeVerifier: flow.verifier,
    expectedState: flow.state,
    expectedNonce: flow.nonce,
    idTokenExpected: true,
  });
  return tokens.claims()!;
}
