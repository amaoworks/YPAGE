import { appOrder } from "@/lib/db/schema";
import { reorderApps } from "@/lib/db/store";
import { json, readJson, requireApiAuth } from "@/lib/http/api";

export const PUT = requireApiAuth(async (request) =>
  json(reorderApps(appOrder.parse(await readJson(request)).items)),
);
