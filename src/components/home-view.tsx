"use client";

import Link from "next/link";
import { useState, type KeyboardEvent } from "react";
import type { App } from "@/lib/db/schema";
import type { Probe } from "@/lib/portal-types";
import {
  appHost,
  displayName,
  formatCount,
  formatGroupIcon,
  healthSummary,
  probeLabel,
  probeTitle,
  probeTone,
  slowProbeMs,
} from "@/lib/view";
import { AppIcon } from "@/components/app-icon";
import { usePortal } from "@/components/shell";

export function HomeView() {
  const { data, statuses, statusPhase, refreshStatus } = usePortal();
  const [groupId, setGroupId] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const activeGroup = groupId !== "all" && data.groups.some((group) => group.id === groupId) ? groupId : "all";
  const visible = activeGroup === "all" ? data.groups : data.groups.filter((group) => group.id === activeGroup);
  const totalApps = data.groups.reduce((sum, group) => sum + group.apps.length, 0);
  const probed = data.groups.flatMap((group) => group.apps).filter((app) => app.healthCheckEnabled);
  const known = probed.filter((app) => statuses.has(app.id));
  const healthy = known.filter((app) => statuses.get(app.id)?.status === "online");
  const summary = healthSummary(probed.length, healthy.length, data.settings.showHealthStatus, statusPhase, known.length);
  const tone = summaryTone(data.settings.showHealthStatus, probed, statuses, statusPhase);
  const tabIds = ["all", ...data.groups.map((group) => group.id)];

  async function forceRefresh() {
    setRefreshing(true);
    try {
      await refreshStatus(true);
    } finally {
      setRefreshing(false);
    }
  }

  function handleTabKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const current = tabIds.indexOf(activeGroup);
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const nextId = tabIds[(current + delta + tabIds.length) % tabIds.length];
    setGroupId(nextId);
  }

  return (
    <>
      <div className="metabar">
        <div className="seg-tabs" role="tablist" aria-label="分组" onKeyDown={handleTabKey}>
          <button
            type="button"
            role="tab"
            aria-selected={activeGroup === "all"}
            className={activeGroup === "all" ? "seg-tab active" : "seg-tab"}
            onClick={() => setGroupId("all")}
          >
            ALL [{formatCount(totalApps)}]
          </button>
          {data.groups.map((group) => (
            <button
              key={group.id}
              type="button"
              role="tab"
              aria-selected={activeGroup === group.id}
              className={activeGroup === group.id ? "seg-tab active" : "seg-tab"}
              onClick={() => setGroupId(group.id)}
            >
              {group.name} [{formatCount(group.apps.length)}]
            </button>
          ))}
        </div>
        <div className="meta-health">
          <span className={`dot ${tone}`} />
          <span aria-live="polite">{summary} · <span className="user-tag">{displayName(data.user)}</span></span>
          {data.settings.showHealthStatus ? (
            <button type="button" className="text-btn" onClick={() => void forceRefresh()} disabled={refreshing}>
              {refreshing ? "…" : "REFRESH"}
            </button>
          ) : null}
        </div>
      </div>
      <main className="catalog-main">
        {data.groups.length === 0 ? (
          <section className="group-section">
            <div className="swiss-grid">
              <div className="swiss-cell span">
                <p className="cell-desc">还没有分组。<Link href="/admin">去管理界面添加</Link></p>
              </div>
            </div>
          </section>
        ) : null}
        {visible.map((group) => {
          const index = data.groups.findIndex((item) => item.id === group.id);
          const groupIcon = formatGroupIcon(group.icon);
          return (
            <section key={group.id} className="group-section" aria-label={group.name}>
              <div className="section-bar">
                <span className="section-label">
                  <span>{formatCount(index + 1)} / {group.name}{groupIcon ? ` ${groupIcon}` : ""}</span>
                  {group.description ? <span className="section-desc">{group.description}</span> : null}
                </span>
                <span className="section-count">{group.apps.length} NODES</span>
              </div>
              <div className="swiss-grid">
                {group.apps.length === 0 ? (
                  <div className="swiss-cell span">
                    <p className="cell-desc">此分组还没有项目。<Link href="/admin">去管理界面添加</Link></p>
                  </div>
                ) : null}
                {group.apps.map((app) => (
                  <AppCell key={app.id} app={app} showProbe={data.settings.showHealthStatus && app.healthCheckEnabled} probe={statuses.get(app.id)} />
                ))}
              </div>
            </section>
          );
        })}
      </main>
      <footer className="foot-strip">
        <span>{data.settings.siteSubtitle || `AUTH: ${data.oidc.brandName}`}</span>
        <span>{data.oidc.brandName} · CROSS-DOMAIN SSO</span>
      </footer>
    </>
  );
}

function summaryTone(
  enabled: boolean,
  probed: App[],
  statuses: Map<string, Probe>,
  phase: string,
): string {
  if (!enabled || probed.length === 0) return "";
  const results = probed.map((app) => statuses.get(app.id)).filter((item): item is Probe => item !== undefined);
  if (phase === "loading" && results.length < probed.length) return "";
  if (phase === "error" && results.length === 0) return "offline";
  if (results.some((probe) => probe.status === "offline")) return "offline";
  if (results.some((probe) => probe.status === "degraded" || probe.latencyMs >= slowProbeMs)) return "degraded";
  return results.length > 0 ? "online" : "";
}

function AppCell({ app, showProbe, probe }: { app: App; showProbe: boolean; probe: Probe | undefined }) {
  return (
    <a className="swiss-cell" href={app.url} target={app.openInNewTab ? "_blank" : undefined} rel={app.openInNewTab ? "noopener noreferrer" : undefined}>
      <div>
        <div className="cell-top">
          <div className="cell-title">
            <AppIcon app={app} />
            <span>{app.name}</span>
          </div>
          <span className="arrow" aria-hidden="true">{app.openInNewTab ? "↗" : "→"}</span>
        </div>
        {app.description ? <p className="cell-desc">{app.description}</p> : null}
      </div>
      <div className="cell-foot">
        <span className="host">{appHost(app.url)}</span>
        <span className="badges">
          {app.ssoEnabled ? <span className="tag-mono">OIDC</span> : null}
          {showProbe ? (
            <span className="tag-mono" title={probeTitle(probe)}>
              <span className={`dot ${probeTone(probe)}`} />
              {probeLabel(probe)}
            </span>
          ) : null}
        </span>
      </div>
    </a>
  );
}
