import { importSchema } from "@/lib/db/schema";
import { importBackup } from "@/lib/db/store";
import { json, readJson, requireApiAuth } from "@/lib/http/api";

export const POST = requireApiAuth(async (request) => {
  const { mode, backup } = importSchema.parse(await readJson(request, 5 * 1024 * 1024));
  return json(importBackup(mode, backup));
});
