"use client";

import { useState } from "react";
import type { App } from "@/lib/db/schema";
import { apiSend } from "@/lib/client/api";
import type { PortalGroup } from "@/lib/portal-types";
import { isHttpUrl } from "@/lib/view";
import { AppIcon } from "@/components/app-icon";
import { Field, Modal, Switch } from "@/components/modal";
import { usePortal } from "@/components/shell";

export function GroupEditor({
  group,
  onClose,
  onDelete,
}: {
  group: PortalGroup | null;
  onClose: () => void;
  onDelete: (group: PortalGroup) => void;
}) {
  const { refresh, notify } = usePortal();
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [icon, setIcon] = useState(group?.icon ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const payload = { name: name.trim(), description: description.trim(), icon: icon.trim() };
    if (!payload.name) {
      setError("名称不能为空");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (group) await apiSend(`/api/groups/${group.id}`, "PATCH", payload);
      else await apiSend("/api/groups", "POST", payload);
      await refresh();
      notify(group ? "分组已更新" : "分组已创建");
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="drawer" labelledBy="group-editor-title">
      <div className="drawer-body">
        <div className="drawer-head">
          <h2 id="group-editor-title">{group ? "编辑分组" : "新建分组"}</h2>
          <button type="button" className="text-btn" onClick={onClose}>关闭</button>
        </div>
        <form
          className="drawer-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field label="名称">
            <input value={name} maxLength={120} autoComplete="off" onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="描述">
            <textarea value={description} maxLength={500} rows={3} onChange={(event) => setDescription(event.target.value)} />
          </Field>
          <Field label="图标" hint="可选，显示为一个 Emoji 或短符号。">
            <input value={icon} maxLength={8} autoComplete="off" placeholder="⌘" onChange={(event) => setIcon(event.target.value)} />
          </Field>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="actions">
            {group ? (
              <button type="button" className="text-btn danger-btn" onClick={() => onDelete(group)}>
                DELETE
              </button>
            ) : null}
            <button type="button" className="text-btn" onClick={onClose}>取消</button>
            <button type="submit" className="inv-btn" disabled={saving}>{saving ? "SAVING" : "SAVE"}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

export function AppEditor({
  app,
  groupId,
  groups,
  onClose,
  onDelete,
}: {
  app: App | null;
  groupId: string;
  groups: PortalGroup[];
  onClose: () => void;
  onDelete: (app: App) => void;
}) {
  const { refresh, notify } = usePortal();
  const [draft, setDraft] = useState({
    groupId: app?.groupId ?? groupId,
    name: app?.name ?? "",
    description: app?.description ?? "",
    url: app?.url ?? "https://",
    iconType: app?.iconType ?? "favicon" as App["iconType"],
    iconValue: app?.iconValue ?? "",
    ssoEnabled: app?.ssoEnabled ?? false,
    healthCheckEnabled: app?.healthCheckEnabled ?? false,
    healthCheckUrl: app?.healthCheckUrl ?? "",
    openInNewTab: app?.openInNewTab ?? true,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const preview = {
    name: draft.name || "预览",
    url: draft.url,
    iconType: draft.iconType,
    iconValue: draft.iconValue,
  };

  function update<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    const healthCheckUrl = draft.healthCheckUrl.trim();
    if (!draft.name.trim()) return setError("名称不能为空");
    if (!isHttpUrl(draft.url.trim())) return setError("地址需要是不带账号密码的 HTTP 或 HTTPS URL");
    if (healthCheckUrl && !isHttpUrl(healthCheckUrl)) return setError("探测地址需要是 HTTP 或 HTTPS URL");
    if (draft.iconType === "image" && !isHttpUrl(draft.iconValue.trim())) return setError("图片图标需要是 HTTP 或 HTTPS URL");
    const payload = {
      groupId: draft.groupId,
      name: draft.name.trim(),
      description: draft.description.trim(),
      url: draft.url.trim(),
      iconType: draft.iconType,
      iconValue: draft.iconValue.trim(),
      ssoEnabled: draft.ssoEnabled,
      healthCheckEnabled: draft.healthCheckEnabled,
      healthCheckUrl: healthCheckUrl || null,
      openInNewTab: draft.openInNewTab,
    };
    setSaving(true);
    setError("");
    try {
      if (app) await apiSend(`/api/apps/${app.id}`, "PATCH", payload);
      else await apiSend("/api/apps", "POST", payload);
      await refresh();
      notify(app ? "项目已更新" : "项目已创建");
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="drawer" labelledBy="app-editor-title">
      <div className="drawer-body">
        <div className="drawer-head">
          <h2 id="app-editor-title">{app ? "编辑项目" : "新建项目"}</h2>
          <button type="button" className="text-btn" onClick={onClose}>关闭</button>
        </div>
        <form
          className="drawer-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field label="分组">
            <select value={draft.groupId} onChange={(event) => update("groupId", event.target.value)}>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </Field>
          <Field label="名称">
            <input value={draft.name} maxLength={120} autoComplete="off" onChange={(event) => update("name", event.target.value)} />
          </Field>
          <Field label="描述">
            <textarea value={draft.description} maxLength={500} rows={3} onChange={(event) => update("description", event.target.value)} />
          </Field>
          <Field label="地址 URL">
            <input value={draft.url} maxLength={2048} inputMode="url" autoComplete="off" spellCheck={false} onChange={(event) => update("url", event.target.value)} />
          </Field>
          <Field label="图标类型">
            <select value={draft.iconType} onChange={(event) => update("iconType", event.target.value as App["iconType"])}>
              <option value="favicon">自动 Favicon</option>
              <option value="lucide">Lucide 图标</option>
              <option value="image">图片 URL</option>
              <option value="emoji">Emoji</option>
            </select>
          </Field>
          {draft.iconType !== "favicon" ? (
            <Field label="图标值" hint={draft.iconType === "lucide" ? "例如 book-open" : undefined}>
              <input value={draft.iconValue} maxLength={2048} autoComplete="off" spellCheck={false} onChange={(event) => update("iconValue", event.target.value)} />
            </Field>
          ) : null}
          <div className="icon-preview">
            <AppIcon app={preview} />
            <span>图标预览</span>
          </div>
          <label className="switch-row">
            <span>新窗口打开</span>
            <Switch checked={draft.openInNewTab} label="新窗口打开" onChange={(checked) => update("openInNewTab", checked)} />
          </label>
          <label className="switch-row">
            <span>SSO / OIDC</span>
            <Switch checked={draft.ssoEnabled} label="使用 YPAGE PASS" onChange={(checked) => update("ssoEnabled", checked)} />
          </label>
          <label className="switch-row">
            <span>健康检查</span>
            <Switch checked={draft.healthCheckEnabled} label="健康检查" onChange={(checked) => update("healthCheckEnabled", checked)} />
          </label>
          <Field label="探测 URL" hint="留空时探测项目地址。">
            <input
              value={draft.healthCheckUrl}
              maxLength={2048}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="可选"
              onChange={(event) => update("healthCheckUrl", event.target.value)}
            />
          </Field>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="actions">
            {app ? <button type="button" className="text-btn danger-btn" onClick={() => onDelete(app)}>DELETE</button> : null}
            <button type="button" className="text-btn" onClick={onClose}>取消</button>
            <button type="submit" className="inv-btn" disabled={saving}>{saving ? "SAVING" : "SAVE"}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
