"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import type { App, Settings } from "@/lib/db/schema";
import { apiSend, RequestError } from "@/lib/client/api";
import { adjacentIndex, reorderIndex } from "@/lib/order";
import type { Backup } from "@/lib/db/schema";
import type { PortalGroup } from "@/lib/portal-types";
import { appHost, formatCount, formatGroupIcon, probeLabel, probeTitle, probeTone } from "@/lib/view";
import { AppIcon } from "@/components/app-icon";
import { AppEditor, GroupEditor } from "@/components/editors";
import { Field, Modal, Switch } from "@/components/modal";
import { usePortal } from "@/components/shell";

type DragState = { kind: "group" | "app"; id: string };
type OverState = { kind: "group"; beforeId: string | null } | { kind: "app"; groupId: string; beforeId: string | null };
type ConfirmState = { title: string; body: string; label: string; run: () => Promise<void>; onCancel?: () => void };

function settingsDraft(settings: Settings) {
  return {
    siteTitle: settings.siteTitle,
    siteSubtitle: settings.siteSubtitle,
    passBrandName: settings.passBrandName,
    defaultTheme: settings.defaultTheme,
    showHealthStatus: settings.showHealthStatus,
    healthCheckIntervalSec: String(settings.healthCheckIntervalSec),
  };
}

function sameOver(left: OverState | null, right: OverState): boolean {
  if (!left || left.kind !== right.kind) return false;
  if (left.kind === "group" && right.kind === "group") return left.beforeId === right.beforeId;
  return left.kind === "app" && right.kind === "app" && left.groupId === right.groupId && left.beforeId === right.beforeId;
}

function readBackup(value: unknown): Backup | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<Backup>;
  if (record.version !== 1 || !Array.isArray(record.groups) || !Array.isArray(record.apps) || !record.settings || typeof record.settings !== "object") {
    return null;
  }
  return value as Backup;
}

function filenameFrom(header: string | null): string {
  return /filename="([^"]+)"/.exec(header ?? "")?.[1] ?? "ypage-backup.json";
}

export function AdminView() {
  const { data, refresh, notify, statuses } = usePortal();
  const [editor, setEditor] = useState<{ type: "group"; group: PortalGroup | null } | { type: "app"; app: App | null; groupId: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [importing, setImporting] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [over, setOver] = useState<OverState | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => settingsDraft(data.settings));
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const dragRef = useRef<DragState | null>(null);
  const baseline = useRef(data.settings);
  const fileRef = useRef<HTMLInputElement>(null);
  const serverDraft = settingsDraft(data.settings);
  const dirty = JSON.stringify(draft) !== JSON.stringify(serverDraft);

  useEffect(() => {
    const previous = settingsDraft(baseline.current);
    const server = settingsDraft(data.settings);
    setDraft((current) => (JSON.stringify(current) === JSON.stringify(previous) ? server : current));
    baseline.current = data.settings;
  }, [data.settings]);

  function beginDrag(next: DragState) {
    dragRef.current = next;
    setDrag(next);
  }

  function finishDrag() {
    dragRef.current = null;
    setDrag(null);
    setOver(null);
  }

  function markOver(next: OverState) {
    setOver((current) => (sameOver(current, next) ? current : next));
  }

  async function commit(work: () => Promise<void>, success: string) {
    try {
      await work();
      await refresh();
      if (success) notify(success);
    } catch (error) {
      notify(error instanceof Error ? error.message : "操作失败");
      await refresh().catch(() => undefined);
    }
  }

  async function moveGroup(id: string, offset: -1 | 1) {
    const sortOrder = adjacentIndex(data.groups.map((group) => group.id), id, offset);
    if (sortOrder === null) return;
    await commit(() => apiSend("/api/groups/reorder", "PUT", { items: [{ id, sortOrder }] }), "");
  }

  async function moveApp(group: PortalGroup, id: string, offset: -1 | 1) {
    const sortOrder = adjacentIndex(group.apps.map((app) => app.id), id, offset);
    if (sortOrder === null) return;
    await commit(() => apiSend("/api/apps/reorder", "PUT", { items: [{ id, sortOrder }] }), "");
  }

  function dropGroup(beforeId: string | null) {
    const current = dragRef.current;
    finishDrag();
    if (!current || current.kind !== "group") return;
    const sortOrder = reorderIndex(data.groups.map((group) => group.id), current.id, beforeId);
    if (sortOrder === null) return;
    void commit(() => apiSend("/api/groups/reorder", "PUT", { items: [{ id: current.id, sortOrder }] }), "分组顺序已更新");
  }

  function dropApp(groupId: string, beforeId: string | null) {
    const current = dragRef.current;
    finishDrag();
    if (!current || current.kind !== "app") return;
    const group = data.groups.find((item) => item.id === groupId);
    if (!group) return;
    const sortOrder = reorderIndex(group.apps.map((app) => app.id), current.id, beforeId);
    if (sortOrder === null) return;
    const sameGroup = group.apps.some((app) => app.id === current.id);
    void commit(
      () => apiSend("/api/apps/reorder", "PUT", { items: [{ id: current.id, sortOrder, ...(sameGroup ? {} : { groupId }) }] }),
      "项目顺序已更新",
    );
  }

  async function patchApp(id: string, key: string, body: { ssoEnabled?: boolean; healthCheckEnabled?: boolean }) {
    setPending(key);
    try {
      await apiSend(`/api/apps/${id}`, "PATCH", body);
      await refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "更新失败");
    } finally {
      setPending(null);
    }
  }

  async function saveSettings() {
    if (!draft.siteTitle.trim() || !draft.passBrandName.trim()) {
      setSettingsError("站点标题和认证品牌不能为空");
      return;
    }
    const intervalSec = Number(draft.healthCheckIntervalSec.trim());
    if (!draft.healthCheckIntervalSec.trim() || !Number.isInteger(intervalSec) || intervalSec < 5 || intervalSec > 3600) {
      setSettingsError("探测间隔需要在 5 到 3600 秒之间的整数");
      return;
    }
    setSavingSettings(true);
    setSettingsError("");
    try {
      await apiSend("/api/settings", "PATCH", {
        siteTitle: draft.siteTitle.trim(),
        siteSubtitle: draft.siteSubtitle.trim(),
        passBrandName: draft.passBrandName.trim(),
        defaultTheme: draft.defaultTheme,
        showHealthStatus: draft.showHealthStatus,
        healthCheckIntervalSec: intervalSec,
      });
      await refresh();
      notify("站点设置已保存");
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSavingSettings(false);
    }
  }

  async function exportBackup() {
    try {
      const response = await fetch("/api/backup/export", { cache: "no-store" });
      if (!response.ok) throw new RequestError("导出失败", response.status);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameFrom(response.headers.get("Content-Disposition"));
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      notify(error instanceof Error ? error.message : "导出失败");
    }
  }

  async function importBackup(mode: "merge" | "replace") {
    if (!backup || importing) return;
    setImporting(true);
    try {
      await commit(async () => {
        await apiSend("/api/backup/import", "POST", { mode, backup });
        setBackup(null);
      }, mode === "replace" ? "备份已覆盖恢复" : "备份已合并");
    } finally {
      setImporting(false);
    }
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      notify("备份超过 5 MiB");
      return;
    }
    try {
      const parsed = readBackup(JSON.parse(await file.text()) as unknown);
      if (!parsed) {
        notify("这不是可识别的 YPAGE 备份");
        return;
      }
      setBackup(parsed);
    } catch {
      notify("备份文件不是有效的 JSON");
    }
  }

  function askDeleteGroup(group: PortalGroup) {
    setEditor(null);
    setConfirm({
      title: "删除分组",
      body: `删除「${group.name}」会同时删除其中 ${group.apps.length} 个项目。`,
      label: "DELETE",
      run: async () => {
        await apiSend(`/api/groups/${group.id}`, "DELETE");
        await refresh();
        notify("分组已删除");
      },
    });
  }

  function askDeleteApp(app: App) {
    setEditor(null);
    setConfirm({
      title: "删除项目",
      body: `删除「${app.name}」。之后可以靠备份恢复。`,
      label: "DELETE",
      run: async () => {
        await apiSend(`/api/apps/${app.id}`, "DELETE");
        await refresh();
        notify("项目已删除");
      },
    });
  }

  const firstGroup = data.groups[0];

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h1>INDEX REGISTRY / 管理表</h1>
          <p className="kicker">CRUD · DRAG ORDER · JSON SNAPSHOT</p>
        </div>
        <div className="h-controls">
          <button type="button" className="cmd-btn" onClick={() => void exportBackup()}>EXPORT .JSON</button>
          <button type="button" className="cmd-btn" onClick={() => fileRef.current?.click()}>IMPORT .JSON</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              void chooseFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <button type="button" className="text-btn" onClick={() => setEditor({ type: "group", group: null })}>+ NEW GROUP</button>
          <button
            type="button"
            className="inv-btn"
            disabled={!firstGroup}
            title={!firstGroup ? "请先创建一个分组" : undefined}
            onClick={() => firstGroup && setEditor({ type: "app", app: null, groupId: firstGroup.id })}
          >
            + NEW APP
          </button>
        </div>
      </div>

      {data.groups.length === 0 ? (
        <div className="group-block">
          <div className="group-empty">
            <span>还没有分组。先新建一个分组，再登记项目。</span>
            <button type="button" className="text-btn" onClick={() => setEditor({ type: "group", group: null })}>+ NEW GROUP</button>
          </div>
        </div>
      ) : null}

      {data.groups.map((group, groupIndex) => {
        const groupIcon = formatGroupIcon(group.icon);
        const isDraggingGroup = drag?.kind === "group" && drag.id === group.id;
        return (
          <section
            key={group.id}
            className={isDraggingGroup ? "group-block dragging" : "group-block"}
            onDragOver={(event) => {
              if (dragRef.current?.kind !== "group") return;
              event.preventDefault();
              markOver({ kind: "group", beforeId: group.id });
            }}
            onDrop={(event) => {
              if (dragRef.current?.kind !== "group") return;
              event.preventDefault();
              dropGroup(group.id);
            }}
          >
            <div className={over?.kind === "group" && over.beforeId === group.id ? "section-bar insert-before" : "section-bar"}>
              <span className="section-label" title={group.description}>
                <span>{formatCount(groupIndex + 1)} / {group.name}{groupIcon ? ` ${groupIcon}` : ""}</span>
                {group.description ? <span className="section-desc">{group.description}</span> : null}
              </span>
              <span className="section-actions">
                <button type="button" className="text-btn" onClick={() => setEditor({ type: "app", app: null, groupId: group.id })}>+ APP</button>
                <button type="button" className="icon-btn" aria-label="上移分组" disabled={groupIndex === 0} onClick={() => void moveGroup(group.id, -1)}>
                  <ChevronUp size={14} strokeWidth={1.75} />
                </button>
                <button type="button" className="icon-btn" aria-label="下移分组" disabled={groupIndex === data.groups.length - 1} onClick={() => void moveGroup(group.id, 1)}>
                  <ChevronDown size={14} strokeWidth={1.75} />
                </button>
                <button type="button" className="text-btn" onClick={() => setEditor({ type: "group", group })}>EDIT</button>
                <button type="button" className="text-btn danger-btn" onClick={() => askDeleteGroup(group)}>DELETE</button>
                <button
                  type="button"
                  className="drag-handle grip"
                  draggable
                  aria-label={`拖拽分组 ${group.name}`}
                  onDragStart={(event) => startDrag(event, { kind: "group", id: group.id }, beginDrag)}
                  onDragEnd={finishDrag}
                >
                  <GripVertical size={14} strokeWidth={1.75} />
                </button>
                <span className="section-count">{group.apps.length} NODES</span>
              </span>
            </div>
            {group.apps.length > 0 ? (
              <div className="table-wrap">
                <table className="mono-table">
                  <thead>
                    <tr>
                      <th>NAME</th>
                      <th>DOMAIN</th>
                      <th>AUTH</th>
                      <th>PROBE</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.apps.map((app, appIndex) => {
                      const probe = statuses.get(app.id);
                      const isDraggingApp = drag?.kind === "app" && drag.id === app.id;
                      const isInsertBefore = over?.kind === "app" && over.groupId === group.id && over.beforeId === app.id;
                      const rowClass = [isDraggingApp ? "dragging" : "", isInsertBefore ? "insert-before" : ""].filter(Boolean).join(" ") || undefined;
                      return (
                        <tr
                          key={app.id}
                          className={rowClass}
                          onDragOver={(event) => {
                            if (dragRef.current?.kind !== "app") return;
                            event.preventDefault();
                            markOver({ kind: "app", groupId: group.id, beforeId: app.id });
                          }}
                          onDrop={(event) => {
                            if (dragRef.current?.kind !== "app") return;
                            event.preventDefault();
                            dropApp(group.id, app.id);
                          }}
                        >
                          <td>
                            <div className="name-cell">
                              <button
                                type="button"
                                className="drag-handle grip"
                                draggable
                                aria-label={`拖拽项目 ${app.name}`}
                                onDragStart={(event) => startDrag(event, { kind: "app", id: app.id }, beginDrag)}
                                onDragEnd={finishDrag}
                              >
                                <GripVertical size={14} strokeWidth={1.75} />
                              </button>
                              <AppIcon app={app} size={16} />
                              <button type="button" onClick={() => setEditor({ type: "app", app, groupId: group.id })}>{app.name}</button>
                            </div>
                          </td>
                          <td className="domain">
                            <a href={app.url} target={app.openInNewTab ? "_blank" : undefined} rel={app.openInNewTab ? "noopener noreferrer" : undefined}>
                              {appHost(app.url)}
                            </a>
                          </td>
                          <td>
                            <Switch
                              checked={app.ssoEnabled}
                              label={`${app.name} SSO`}
                              disabled={pending === `${app.id}:sso`}
                              onChange={(checked) => void patchApp(app.id, `${app.id}:sso`, { ssoEnabled: checked })}
                            />
                          </td>
                          <td>
                            <span className="badges">
                              <Switch
                                checked={app.healthCheckEnabled}
                                label={`${app.name} 健康检查`}
                                disabled={pending === `${app.id}:health`}
                                onChange={(checked) => void patchApp(app.id, `${app.id}:health`, { healthCheckEnabled: checked })}
                              />
                              {data.settings.showHealthStatus && app.healthCheckEnabled ? (
                                <span className="tag-mono" title={probeTitle(probe)}>
                                  <span className={`dot ${probeTone(probe)}`} />
                                  {probeLabel(probe)}
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td>
                            <span className="section-actions">
                              <button type="button" className="icon-btn" aria-label="上移项目" disabled={appIndex === 0} onClick={() => void moveApp(group, app.id, -1)}>
                                <ChevronUp size={14} strokeWidth={1.75} />
                              </button>
                              <button type="button" className="icon-btn" aria-label="下移项目" disabled={appIndex === group.apps.length - 1} onClick={() => void moveApp(group, app.id, 1)}>
                                <ChevronDown size={14} strokeWidth={1.75} />
                              </button>
                              <button type="button" className="text-btn" onClick={() => setEditor({ type: "app", app, groupId: group.id })}>EDIT</button>
                              <button type="button" className="text-btn danger-btn" onClick={() => askDeleteApp(app)}>DELETE</button>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : drag?.kind !== "app" ? (
              <div className="group-empty">
                <span>此分组还没有项目。</span>
                <button type="button" className="text-btn" onClick={() => setEditor({ type: "app", app: null, groupId: group.id })}>+ ADD APP</button>
              </div>
            ) : null}
            {drag?.kind === "app" ? (
              <div
                className={over?.kind === "app" && over.groupId === group.id && over.beforeId === null ? "drop-end active" : "drop-end"}
                onDragOver={(event) => {
                  event.preventDefault();
                  markOver({ kind: "app", groupId: group.id, beforeId: null });
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  dropApp(group.id, null);
                }}
              >
                放到「{group.name}」末尾
              </div>
            ) : null}
          </section>
        );
      })}
      {drag?.kind === "group" ? (
        <div
          className={over?.kind === "group" && over.beforeId === null ? "drop-end active" : "drop-end"}
          onDragOver={(event) => {
            event.preventDefault();
            markOver({ kind: "group", beforeId: null });
          }}
          onDrop={(event) => {
            event.preventDefault();
            dropGroup(null);
          }}
        >
          放到全部分组末尾
        </div>
      ) : null}

      <form
        className="settings"
        onSubmit={(event) => {
          event.preventDefault();
          void saveSettings();
        }}
      >
        <div className="settings-head">
          <h2>SITE SETTINGS / 站点设置</h2>
          {dirty ? <span className="tag-mono">UNSAVED</span> : null}
        </div>
        <div className="settings-grid">
          <Field label="站点标题">
            <input value={draft.siteTitle} maxLength={120} onChange={(event) => setDraft({ ...draft, siteTitle: event.target.value })} />
          </Field>
          <Field label="认证品牌">
            <input value={draft.passBrandName} maxLength={120} onChange={(event) => setDraft({ ...draft, passBrandName: event.target.value })} />
          </Field>
          <Field label="副标题" wide>
            <input value={draft.siteSubtitle} maxLength={500} onChange={(event) => setDraft({ ...draft, siteSubtitle: event.target.value })} />
          </Field>
          <Field label="默认主题" hint="这台浏览器若已手动切换，以浏览器设置为准。">
            <select value={draft.defaultTheme} onChange={(event) => setDraft({ ...draft, defaultTheme: event.target.value as Settings["defaultTheme"] })}>
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </Field>
          <Field label="探测间隔（秒）" hint="范围 5–3600 秒。">
            <input
              type="number"
              min={5}
              max={3600}
              inputMode="numeric"
              value={draft.healthCheckIntervalSec}
              onChange={(event) => setDraft({ ...draft, healthCheckIntervalSec: event.target.value })}
            />
          </Field>
          <label className="switch-row wide">
            <span>显示健康检查</span>
            <Switch checked={draft.showHealthStatus} label="显示健康检查" onChange={(checked) => setDraft({ ...draft, showHealthStatus: checked })} />
          </label>
        </div>
        {settingsError ? <p className="form-error">{settingsError}</p> : null}
        <div className="actions">
          {dirty ? (
            <button
              type="button"
              className="text-btn"
              disabled={savingSettings}
              onClick={() => {
                setDraft(serverDraft);
                setSettingsError("");
              }}
            >
              RESET
            </button>
          ) : null}
          <button type="submit" className="inv-btn" disabled={!dirty || savingSettings}>{savingSettings ? "SAVING" : "SAVE"}</button>
        </div>
      </form>

      {editor?.type === "group" ? (
        <GroupEditor key={editor.group?.id ?? "new-group"} group={editor.group} onClose={() => setEditor(null)} onDelete={askDeleteGroup} />
      ) : null}
      {editor?.type === "app" ? (
        <AppEditor
          key={editor.app?.id ?? `new-app-${editor.groupId}`}
          app={editor.app}
          groupId={editor.groupId}
          groups={data.groups}
          onClose={() => setEditor(null)}
          onDelete={askDeleteApp}
        />
      ) : null}
      {backup ? (
        <Modal onClose={() => { if (!importing) setBackup(null); }} className="confirm" labelledBy="import-title">
          <div className="confirm-body">
            <h2 id="import-title">导入备份</h2>
            <p>文件包含 {backup.groups.length} 个分组、{backup.apps.length} 个项目。合并按 ID 更新或新增；覆盖会先清空当前分组、项目和设置。</p>
            <div className="actions">
              <button type="button" className="text-btn" disabled={importing} onClick={() => setBackup(null)}>取消</button>
              <button type="button" className="text-btn" disabled={importing} onClick={() => void importBackup("merge")}>{importing ? "…" : "MERGE"}</button>
              <button
                type="button"
                className="inv-btn"
                disabled={importing}
                onClick={() => {
                  const snapshot = backup;
                  setBackup(null);
                  setConfirm({
                    title: "覆盖当前数据",
                    body: `覆盖会删除现在的全部分组、项目和设置，再写入这份包含 ${snapshot.groups.length} 个分组与 ${snapshot.apps.length} 个项目的备份。`,
                    label: "REPLACE",
                    onCancel: () => setBackup(snapshot),
                    run: async () => {
                      await apiSend("/api/backup/import", "POST", { mode: "replace", backup: snapshot });
                      await refresh();
                      notify("备份已覆盖恢复");
                    },
                  });
                }}
              >
                REPLACE
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {confirm ? (
        <Modal
          onClose={() => {
            if (!confirming) {
              const cancel = confirm.onCancel;
              setConfirm(null);
              cancel?.();
            }
          }}
          className="confirm"
          labelledBy="confirm-title"
        >
          <form
            className="confirm-body"
            onSubmit={(event) => {
              event.preventDefault();
              setConfirming(true);
              void confirm.run().then(() => setConfirm(null)).catch((error: unknown) => {
                notify(error instanceof Error ? error.message : "操作失败");
              }).finally(() => setConfirming(false));
            }}
          >
            <h2 id="confirm-title">{confirm.title}</h2>
            <p>{confirm.body}</p>
            <div className="actions">
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  const cancel = confirm.onCancel;
                  setConfirm(null);
                  cancel?.();
                }}
                disabled={confirming}
              >
                取消
              </button>
              <button type="submit" className="inv-btn" disabled={confirming}>{confirming ? "…" : confirm.label}</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}

function startDrag(event: DragEvent<HTMLElement>, next: DragState, begin: (next: DragState) => void) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", next.id);
  begin(next);
}
