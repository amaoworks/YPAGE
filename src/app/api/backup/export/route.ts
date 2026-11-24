import { exportBackup } from "@/lib/db/store";
import { json, requireApiAuth } from "@/lib/http/api";

export const GET = requireApiAuth(() => {
  const backup = exportBackup();
  const response = json(backup);
  response.headers.set("Content-Disposition", `attachment; filename="ypage-backup-${backup.exportedAt.slice(0, 10)}.json"`);
  return response;
});
