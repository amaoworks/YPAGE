import type { ReactNode } from "react";
import { Shell } from "@/components/shell";
import { loadPortal } from "@/lib/portal";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const data = await loadPortal();
  return <Shell initial={data}>{children}</Shell>;
}
