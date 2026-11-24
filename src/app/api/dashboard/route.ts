import { publicOidc } from "@/lib/config";
import { readDashboard } from "@/lib/db/store";
import { json, requireApiAuth } from "@/lib/http/api";

export const GET = requireApiAuth((_request, user) => {
  const dashboard = readDashboard();
  return json({ user, ...dashboard, oidc: publicOidc(dashboard.settings.passBrandName) });
});
