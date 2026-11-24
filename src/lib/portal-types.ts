import type { App, Group, Settings } from "@/lib/db/schema";

export type PortalUser = {
  sub: string;
  name: string;
  username?: string;
  email?: string;
};

export type PublicOidc = {
  brandName: string;
  issuer: string | null;
  discoveryUrl: string | null;
  scope: string;
};

export type PortalGroup = Group & { apps: App[] };

export type PortalData = {
  user: PortalUser;
  settings: Settings;
  groups: PortalGroup[];
  oidc: PublicOidc;
};

export type Probe = {
  appId: string;
  status: "online" | "offline";
  httpStatus: number | null;
  latencyMs: number;
  checkedAt: string;
};

export type StatusPayload = {
  enabled: boolean;
  intervalSec: number;
  statuses: Probe[];
};

export type StatusPhase = "off" | "loading" | "ready" | "error";
