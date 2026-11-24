import { newGroup } from "@/lib/db/schema";
import { createGroup, listGroups } from "@/lib/db/store";
import { json, readJson, requireApiAuth } from "@/lib/http/api";

export const GET = requireApiAuth(() => json(listGroups()));

export const POST = requireApiAuth(async (request) =>
  json(createGroup(newGroup.parse(await readJson(request))), 201),
);
