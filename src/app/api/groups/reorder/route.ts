import { groupOrder } from "@/lib/db/schema";
import { reorderGroups } from "@/lib/db/store";
import { json, readJson, requireApiAuth } from "@/lib/http/api";

export const PUT = requireApiAuth(async (request) =>
  json(reorderGroups(groupOrder.parse(await readJson(request)).items)),
);
