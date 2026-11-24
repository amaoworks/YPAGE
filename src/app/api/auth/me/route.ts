import { publicOidc } from "@/lib/config";
import { getSettings } from "@/lib/db/store";
import { json, requireApiAuth } from "@/lib/http/api";

export const GET = requireApiAuth((_request, user) =>
  json({ user, oidc: publicOidc(getSettings().passBrandName) }),
);
