import type { PortalGroup } from "@/lib/portal-types";
import { appHost } from "@/lib/view";

export type SearchHit = {
  appId: string;
  name: string;
  description: string;
  groupName: string;
  host: string;
  url: string;
  openInNewTab: boolean;
};

export function searchApps(groups: PortalGroup[], query: string): SearchHit[] {
  const needle = query.trim().toLowerCase();
  const hits: SearchHit[] = [];
  for (const group of groups) {
    for (const app of group.apps) {
      const host = appHost(app.url);
      const haystack = `${app.name}\n${app.description}\n${group.name}\n${host}`.toLowerCase();
      if (needle && !haystack.includes(needle)) continue;
      hits.push({
        appId: app.id,
        name: app.name,
        description: app.description,
        groupName: group.name,
        host,
        url: app.url,
        openInNewTab: app.openInNewTab,
      });
    }
  }
  return hits;
}

export function stepIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (current + delta + length) % length;
}
