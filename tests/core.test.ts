import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adjacentIndex, reorderIndex } from "@/lib/order";
import { searchApps, stepIndex } from "@/lib/search";
import { safeNext } from "@/lib/auth/oidc";
import {
  envTemplate,
  formatCount,
  formatGroupIcon,
  healthSummary,
  isHttpUrl,
  probeLabel,
  probeTitle,
  probeTone,
  tinyauthClientTemplate,
  toIconName,
} from "@/lib/view";
import {
  createApp,
  createGroup,
  deleteApp,
  deleteGroup,
  exportBackup,
  getSettings,
  importBackup,
  listApps,
  listGroups,
  reorderApps,
  reorderGroups,
  updateApp,
  updateGroup,
  updateSettings,
} from "@/lib/db/store";
import { assertSameOrigin } from "@/lib/http/api";
import type { PortalGroup } from "@/lib/portal-types";

process.env.YPAGE_DB_PATH = ":memory:";

describe("safeNext open-redirect protection", () => {
  it("allows safe relative portal paths", () => {
    assert.equal(safeNext("/"), "/");
    assert.equal(safeNext("/admin"), "/admin");
    assert.equal(safeNext("/oidc?tab=1#env"), "/oidc?tab=1#env");
  });

  it("blocks external, protocol-relative, api, and control-char paths", () => {
    assert.equal(safeNext(null), "/");
    assert.equal(safeNext("https://evil.com"), "/");
    assert.equal(safeNext("//evil.com/admin"), "/");
    assert.equal(safeNext("/%2f/evil.com"), "/");
    assert.equal(safeNext("/api/auth/logout"), "/");
    assert.equal(safeNext("/admin\r\nSet-Cookie: a=b"), "/");
    assert.equal(safeNext("/\\evil.com"), "/");
  });
});

describe("order helpers", () => {
  it("computes reorder target index and detects no-op drops", () => {
    const ids = ["a", "b", "c"];
    assert.equal(reorderIndex(ids, "a", "b"), null);
    assert.equal(reorderIndex(ids, "c", "a"), 0);
    assert.equal(reorderIndex(ids, "a", null), 2);
    assert.equal(reorderIndex(ids, "x", "b"), 1);
  });

  it("computes adjacent swap index safely", () => {
    const ids = ["a", "b", "c"];
    assert.equal(adjacentIndex(ids, "a", -1), null);
    assert.equal(adjacentIndex(ids, "a", 1), 1);
    assert.equal(adjacentIndex(ids, "c", 1), null);
    assert.equal(adjacentIndex(ids, "b", -1), 0);
  });
});

describe("view & search helpers", () => {
  it("formats probe tone, label, title, and health summary per Swiss Mono spec", () => {
    assert.equal(probeTone(undefined), "pending");
    assert.equal(probeLabel(undefined), "···");

    const fast = { status: "online" as const, httpStatus: 200, latencyMs: 24, checkedAt: "2026-11-24T10:00:00.000Z" };
    assert.equal(probeTone(fast), "online");
    assert.equal(probeLabel(fast), "24ms");
    assert.match(probeTitle(fast), /HTTP 200 · 24ms/);

    const slow = { status: "online" as const, httpStatus: 200, latencyMs: 950, checkedAt: "2026-11-24T10:00:00.000Z" };
    assert.equal(probeTone(slow), "degraded");
    assert.equal(probeLabel(slow), "950ms");

    const httpError = { status: "degraded" as const, httpStatus: 503, latencyMs: 42, checkedAt: "2026-11-24T10:00:00.000Z" };
    assert.equal(probeTone(httpError), "degraded");
    assert.equal(probeLabel(httpError), "HTTP 503");
    assert.match(probeTitle(httpError), /HTTP 503/);

    const offline = { status: "offline" as const, httpStatus: null, latencyMs: 4001, checkedAt: "2026-11-24T10:00:00.000Z" };
    assert.equal(probeTone(offline), "offline");
    assert.equal(probeLabel(offline), "OFF");

    assert.equal(healthSummary(2, 1, false, "ready", 2), "PROBES OFF");
    assert.equal(healthSummary(0, 0, true, "ready", 0), "NO PROBES");
    assert.equal(healthSummary(3, 2, true, "ready", 3), "2/3 HEALTHY");
  });

  it("handles counts, multi-codepoint emoji group icons, urls, and icon names", () => {
    assert.equal(formatCount(2), "02");
    assert.equal(formatCount(12), "12");
    assert.equal(formatGroupIcon("code"), "");
    assert.equal(formatGroupIcon("⌘"), "⌘");
    assert.equal(formatGroupIcon("🛠️"), "🛠️");
    assert.equal(formatGroupIcon("👨‍💻"), "👨‍💻");
    assert.equal(isHttpUrl("https://example.com/app"), true);
    assert.equal(isHttpUrl("https://user:pass@example.com"), false);
    assert.equal(isHttpUrl("javascript:alert(1)"), false);
    assert.equal(toIconName("BookOpen"), "book-open");
    assert.match(envTemplate({ brandName: "YPAGE PASS", issuer: null, discoveryUrl: null, scope: "openid" }), /OIDC_ISSUER=/);
    assert.match(tinyauthClientTemplate(), /trustedRedirectUris:/);
  });

  it("searches apps across name, description, group, and host", () => {
    const groups: PortalGroup[] = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: "Core Services",
        description: "",
        icon: "",
        sortOrder: 0,
        createdAt: "2026-11-24T00:00:00.000Z",
        updatedAt: "2026-11-24T00:00:00.000Z",
        apps: [
          {
            id: "00000000-0000-4000-8000-000000000011",
            groupId: "00000000-0000-4000-8000-000000000001",
            name: "YNotes",
            description: "知识库与文档检索",
            url: "https://notes.domain-c.com/",
            iconType: "favicon",
            iconValue: "",
            ssoEnabled: true,
            healthCheckEnabled: true,
            healthCheckUrl: null,
            openInNewTab: true,
            sortOrder: 0,
            createdAt: "2026-11-24T00:00:00.000Z",
            updatedAt: "2026-11-24T00:00:00.000Z",
          },
        ],
      },
    ];
    assert.equal(searchApps(groups, "notes.domain-c.com").length, 1);
    assert.equal(searchApps(groups, "core").length, 1);
    assert.equal(searchApps(groups, "知识库").length, 1);
    assert.equal(searchApps(groups, "nonexistent").length, 0);
    assert.equal(stepIndex(0, -1, 3), 2);
    assert.equal(stepIndex(2, 1, 3), 0);
  });
});

describe("SQLite store CRUD, reordering, and backup", () => {
  it("supports group/app CRUD, cross-group reorder, settings, and backup replace/merge", () => {
    const seededGroups = listGroups();
    assert.equal(seededGroups.length, 1);
    assert.equal(listApps().length, 2);

    const g2 = createGroup({ name: "Infra", description: "基础设施", icon: "🛠️" });
    const g3 = createGroup({ name: "Labs", description: "", icon: "" });
    const reorderedGroups = reorderGroups([{ id: g3.id, sortOrder: 0 }]);
    assert.equal(reorderedGroups[0].id, g3.id);

    const updatedGroup = updateGroup(g2.id, { description: "监控与 CI" });
    assert.equal(updatedGroup.description, "监控与 CI");

    const appA = createApp({
      groupId: g2.id,
      name: "Grafana",
      description: "Metrics",
      url: "https://metrics.example.com",
      iconType: "lucide",
      iconValue: "activity",
      ssoEnabled: true,
      healthCheckEnabled: true,
      healthCheckUrl: "https://metrics.example.com/api/health",
      openInNewTab: true,
    });
    const appB = createApp({
      groupId: g2.id,
      name: "Git Forge",
      description: "Repos",
      url: "https://git.example.com",
      iconType: "favicon",
      iconValue: "",
      ssoEnabled: true,
      healthCheckEnabled: false,
      healthCheckUrl: null,
      openInNewTab: true,
    });

    const moved = reorderApps([{ id: appB.id, groupId: g3.id, sortOrder: 0 }]);
    assert.equal(moved.find((item) => item.id === appB.id)?.groupId, g3.id);
    assert.equal(moved.find((item) => item.id === appA.id)?.sortOrder, 0);

    const editedApp = updateApp(appA.id, { ssoEnabled: false });
    assert.equal(editedApp.ssoEnabled, false);

    const nextSettings = updateSettings({ siteTitle: "MY PAGE", healthCheckIntervalSec: 45 });
    assert.equal(nextSettings.siteTitle, "MY PAGE");
    assert.equal(getSettings().healthCheckIntervalSec, 45);

    const snapshot = exportBackup();
    assert.equal(snapshot.version, 1);

    deleteApp(appA.id);
    deleteGroup(g3.id);
    assert.equal(listApps(g3.id).length, 0);

    const merged = importBackup("merge", snapshot);
    assert.equal(merged.mode, "merge");
    assert.equal(listApps().some((item) => item.id === appA.id), true);

    const replaced = importBackup("replace", {
      ...snapshot,
      groups: [g2],
      apps: [appA],
    });
    assert.equal(replaced.groups, 1);
    assert.equal(replaced.apps, 1);
    assert.equal(listGroups().length, 1);
    assert.equal(listApps().length, 1);
  });
});

describe("assertSameOrigin CSRF protection", () => {
  it("allows matching YPAGE_URL origin and blocks cross-site requests", () => {
    const prevUrl = process.env.YPAGE_URL;
    process.env.YPAGE_URL = "https://home.example.com";
    try {
      const okReq = new Request("https://home.example.com/api/groups", {
        method: "POST",
        headers: {
          host: "home.example.com",
          origin: "https://home.example.com",
          "sec-fetch-site": "same-origin",
        },
      });
      assert.doesNotThrow(() => assertSameOrigin(okReq));

      const badOriginReq = new Request("https://home.example.com/api/groups", {
        method: "POST",
        headers: {
          host: "home.example.com",
          origin: "https://evil.example.com",
          "sec-fetch-site": "cross-site",
        },
      });
      assert.throws(() => assertSameOrigin(badOriginReq), /Origin is not allowed/);

      const crossSiteNoOrigin = new Request("https://home.example.com/api/groups", {
        method: "POST",
        headers: {
          host: "home.example.com",
          "sec-fetch-site": "cross-site",
        },
      });
      assert.throws(() => assertSameOrigin(crossSiteNoOrigin), /Cross-site request is not allowed/);
    } finally {
      if (prevUrl === undefined) delete process.env.YPAGE_URL;
      else process.env.YPAGE_URL = prevUrl;
    }
  });
});
