import type { Probe, PortalUser, PublicOidc, StatusPhase } from "@/lib/portal-types";

export const slowProbeMs = 800;

export function displayName(user: PortalUser): string {
  return user.username || user.name || "USER";
}

export function appHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

export type ProbeTone = "online" | "degraded" | "offline" | "pending";

export function probeTone(probe: Pick<Probe, "status" | "latencyMs"> | undefined): ProbeTone {
  if (!probe) return "pending";
  if (probe.status === "offline") return "offline";
  if (probe.latencyMs >= slowProbeMs) return "degraded";
  return "online";
}

export function probeLabel(probe: Pick<Probe, "status" | "latencyMs"> | undefined): string {
  if (!probe) return "···";
  if (probe.status === "offline") return "OFF";
  return `${probe.latencyMs}ms`;
}

export function healthSummary(
  probed: number,
  healthy: number,
  enabled: boolean,
  phase: StatusPhase,
  known: number,
): string {
  if (!enabled) return "PROBES OFF";
  if (probed === 0) return "NO PROBES";
  if (phase === "error" && known === 0) return "PROBE FAILED";
  if (phase === "loading" && known === 0) return "CHECKING";
  return `${healthy}/${probed} HEALTHY`;
}

export function envTemplate(oidc: PublicOidc): string {
  const issuer = oidc.issuer ?? "https://pass.example.com";
  const discovery = oidc.discoveryUrl ?? `${issuer}/.well-known/openid-configuration`;
  const lines = [
    `OIDC_ISSUER=${issuer}`,
    `OIDC_DISCOVERY=${discovery}`,
    "OIDC_CLIENT_ID=your-service-id",
    "OIDC_CLIENT_SECRET=",
    `OIDC_SCOPES="${oidc.scope}"`,
  ];
  if (!oidc.issuer) lines.unshift("# 当前环境没有配置 OIDC_ISSUER，下面是占位模板");
  return lines.join("\n");
}

export function toIconName(value: string): string {
  const kebab = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/gi, "")
    .toLowerCase();
  return kebab.replace(/^-+|-+$/g, "");
}
