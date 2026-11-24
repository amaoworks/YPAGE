"use client";

import Link from "next/link";
import { useState } from "react";
import type { App } from "@/lib/db/schema";
import { appHost, displayName, healthSummary, probeLabel, probeTone, slowProbeMs } from "@/lib/view";
import { AppIcon } from "@/components/app-icon";
import { usePortal } from "@/components/shell";

export function HomeView() {
  const { data, statuses, statusPhase, refreshStatus } = usePortal();
  const [groupId, setGroupId] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const activeGroup = groupId !== "all" && data.groups.some((group) => group.id === groupId) ? groupId : "all";
  const visible = activeGroup === "all" ? data.groups : data.groups.filter((group) => group.id === activeGroup);
  const probed = data.groups.flatMap((group) => group.apps).filter((app) => app.healthCheckEnabled);
  const known = probed.filter((app) => statuses.has(app.id));
  const healthy = known.filter((app) => statuses.get(app.id)?.status === "online");
  const summary = healthSummary(probed.length, healthy.length, data.settings.showHealthStatus, statusPhase, known.length);
  const tone = summaryTone(data.settings.showHealthStatus, probed.length, healthy.length, known.length, statuses, statusPhase);

  async function forceRefresh() {
    setRefreshing(true);
    try {
      await refreshStatus(true);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <div className="metabar">
        <div className="seg-tabs" role="tablist" aria-label="分组">
          <button type="button" role="tab" aria-selected={activeGroup === "all"} className={activeGroup === "all" ? "seg-tab active" : "seg-tab"} onClick={() => setGroupId("all")}>
            ALL [{data.groups.reduce((sum, group) => sum + group.apps.length, 0)}]
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
              {group.name} [{group.apps.length}]
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
      {data.groups.length === 0 ? (
        <div className="swiss-grid">
          <div className="swiss-cell span">
            <p className="cell-desc">还没有分组。<Link href="/admin">去管理界面添加</Link></p>
          </div>
        </div>
      ) : null}
      {visible.map((group) => {
        const index = data.groups.findIndex((item) => item.id === group.id);
        return (
          <section key={group.id} aria-label={group.name}>
            <div className="section-bar">
              <span>{String(index + 1).padStart(2, "0")} / {group.name}</span>
              <span>{group.apps.length} NODES</span>
            </div>
            <div className="swiss-grid">
              {group.apps.length === 0 ? <div className="swiss-cell span"><p className="cell-desc">此分组还没有项目。</p></div> : null}
              {group.apps.map((app) => (
                <AppCell key={app.id} app={app} showProbe={data.settings.showHealthStatus && app.healthCheckEnabled} probe={statuses.get(app.id)} />
              ))}
            </div>
          </section>
        );
      })}
      <footer className="foot-strip">
        <span>{data.settings.siteSubtitle || `AUTH: ${data.oidc.brandName}`}</span>
        <span>{data.oidc.brandName} · CROSS-DOMAIN SSO</span>
      </footer>
    </>
  );
}

function summaryTone(
  enabled: boolean,
  probed: number,
  healthy: number,
  known: number,
  statuses: Map<string, { status: "online" | "offline"; latencyMs: number }>,
  phase: string,
): string {
  if (!enabled || probed === 0 || (phase === "loading" && known < probed)) return "";
  if (healthy < probed) return "offline";
  const degraded = [...statuses.values()].some((probe) => probe.status === "online" && probe.latencyMs >= slowProbeMs);
  return degraded ? "degraded" : "online";
}

function AppCell({ app, showProbe, probe }: { app: App; showProbe: boolean; probe: { status: "online" | "offline"; latencyMs: number } | undefined }) {
  return (
    <a className="swiss-cell" href={app.url} target={app.openInNewTab ? "_blank" : undefined} rel={app.openInNewTab ? "noopener noreferrer" : undefined}>
      <div>
        <div className="cell-top">
          <div className="cell-title">
            <AppIcon app={app} />
            <span>{app.name}</span>
          </div>
          <span className="arrow" aria-hidden="true">↗</span>
        </div>
        {app.description ? <p className="cell-desc">{app.description}</p> : null}
      </div>
      <div className="cell-foot">
        <span className="host">{appHost(app.url)}</span>
        <span className="badges">
          {app.ssoEnabled ? <span className="tag-mono">OIDC</span> : null}
          {showProbe ? (
            <span className="tag-mono">
              <span className={`dot ${probeTone(probe)}`} />
              {probeLabel(probe)}
            </span>
          ) : null}
        </span>
      </div>
    </a>
  );
}
