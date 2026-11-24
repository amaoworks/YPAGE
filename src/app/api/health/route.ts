import { getDb } from "@/lib/db";
import { json } from "@/lib/http/api";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    getDb().prepare("SELECT 1 FROM settings LIMIT 1").get();
    return json({ status: "ok" });
  } catch (error) {
    console.error("YPAGE database health check failed", error);
    return json({ status: "unavailable" }, 503);
  }
}
