import { editSettings } from "@/lib/db/schema";
import { getSettings, updateSettings } from "@/lib/db/store";
import { json, readJson, requireApiAuth } from "@/lib/http/api";

export const GET = requireApiAuth(() => json(getSettings()));

export const PATCH = requireApiAuth(async (request) =>
  json(updateSettings(editSettings.parse(await readJson(request)))),
);
