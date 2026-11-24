import { newApp, recordId } from "@/lib/db/schema";
import { createApp, listApps } from "@/lib/db/store";
import { json, readJson, requireApiAuth } from "@/lib/http/api";

export const GET = requireApiAuth((request) => {
  const groupId = new URL(request.url).searchParams.get("groupId");
  return json(listApps(groupId === null ? undefined : recordId.parse(groupId)));
});

export const POST = requireApiAuth(async (request) =>
  json(createApp(newApp.parse(await readJson(request))), 201),
);
