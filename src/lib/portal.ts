import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { publicOidc } from "@/lib/config";
import { readDashboard } from "@/lib/db/store";
import type { PortalData } from "@/lib/portal-types";

export async function loadPortal(): Promise<PortalData> {
  const user = await getCurrentSession();
  if (!user) redirect("/api/auth/login?next=/");
  const dashboard = readDashboard();
  return {
    user,
    settings: dashboard.settings,
    groups: dashboard.groups,
    oidc: publicOidc(dashboard.settings.passBrandName),
  };
}
