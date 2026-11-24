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

export function formatCount(count: number): string {
  return String(Math.max(0, count)).padStart(2, "0");
}

export function formatGroupIcon(icon: string): string {
  const trimmed = icon.trim();
  if (!trimmed || /^[a-z0-9_-]{3,}$/i.test(trimmed)) return "";
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed)];
    if (segments.length > 2) return "";
    return trimmed;
  }
  return [...trimmed].length <= 4 ? trimmed : "";
}

export function probeTone(probe: Pick<Probe, "status" | "latencyMs"> | undefined): ProbeTone {
  if (!probe) return "pending";
  if (probe.status === "offline") return "offline";
  if (probe.status === "degraded" || probe.latencyMs >= slowProbeMs) return "degraded";
  return "online";
}

export function probeLabel(probe: Pick<Probe, "status" | "httpStatus" | "latencyMs"> | undefined): string {
  if (!probe) return "···";
  if (probe.status === "offline") return "OFF";
  if (probe.status === "degraded" && probe.httpStatus !== null) return `HTTP ${probe.httpStatus}`;
  return `${probe.latencyMs}ms`;
}

export function probeTitle(probe: Pick<Probe, "status" | "httpStatus" | "latencyMs" | "checkedAt"> | undefined): string {
  if (!probe) return "等待健康检查结果";
  const parsedTime = new Date(probe.checkedAt);
  const timeSuffix = Number.isNaN(parsedTime.getTime())
    ? ""
    : ` · ${parsedTime.toLocaleTimeString("zh-CN", { hour12: false })}`;
  if (probe.status === "offline") {
    return `服务不可达或超时 · ${probe.latencyMs}ms${timeSuffix}`;
  }
  if (probe.status === "degraded") {
    return `HTTP ${probe.httpStatus ?? "异常"}（非 2xx-3xx） · ${probe.latencyMs}ms${timeSuffix}`;
  }
  const slow = probe.latencyMs >= slowProbeMs ? "（高延迟）" : "";
  return `HTTP ${probe.httpStatus ?? 200} · ${probe.latencyMs}ms${slow}${timeSuffix}`;
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

export function tinyauthClientTemplate(): string {
  return [
    "oidc:",
    "  clients:",
    "    my_app:",
    '      name: "我的新项目"',
    '      clientId: "your-service-id"',
    '      clientSecret: "REPLACE_WITH_OPENSSL_RAND_HEX_24"',
    "      trustedRedirectUris:",
    '        - "https://app.example.com/api/auth/callback"',
  ].join("\n");
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
