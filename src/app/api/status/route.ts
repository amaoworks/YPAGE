import { json, requireApiAuth } from "@/lib/http/api";
import { readStatus } from "@/lib/status";

export const GET = requireApiAuth(async (request) =>
  json(await readStatus(new URL(request.url).searchParams.get("force") === "true")),
);
