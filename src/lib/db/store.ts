import { randomUUID } from "node:crypto";
import type { SQLOutputValue } from "node:sqlite";
import type { z } from "zod";
import { ApiError } from "@/lib/http/api";
import { getDb, transaction } from "./index";
import {
  type App, type Backup, type Group, type Settings, appSchema, defaultSettings, maxSortOrder, settingsSchema,
  type appOrder, type groupOrder, type newGroup, type newApp, type editGroup, type editApp,
} from "./schema";

const groupColumns = `
  id, name, description, icon, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
`;
const appColumns = `
  id, group_id AS groupId, name, description, url, icon_type AS iconType, icon_value AS iconValue,
  sso_enabled AS ssoEnabled, health_check_enabled AS healthCheckEnabled, health_check_url AS healthCheckUrl,
  open_in_new_tab AS openInNewTab, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
`;

function toApp(row: Record<string, SQLOutputValue>): App {
  return {
    ...row,
    ssoEnabled: row.ssoEnabled === 1,
    healthCheckEnabled: row.healthCheckEnabled === 1,
    openInNewTab: row.openInNewTab === 1,
  } as App;
}

export function listGroups(): Group[] {
  return getDb().prepare(`SELECT ${groupColumns} FROM groups ORDER BY sort_order, created_at, id`).all() as Group[];
}

export function listApps(groupId?: string): App[] {
  const filter = groupId === undefined ? "" : "WHERE group_id = ?";
  const query = getDb().prepare(`SELECT ${appColumns} FROM apps ${filter} ORDER BY sort_order, created_at, id`);
  return (groupId === undefined ? query.all() : query.all(groupId)).map(toApp);
}

function notFound(entity: "Group" | "App") {
  return new ApiError(404, "not_found", `${entity} not found`);
}

function findGroup(id: string): Group {
  const row = getDb().prepare(`SELECT ${groupColumns} FROM groups WHERE id = ?`).get(id);
  if (!row) throw notFound("Group");
  return row as Group;
}

function findApp(id: string): App {
  const row = getDb().prepare(`SELECT ${appColumns} FROM apps WHERE id = ?`).get(id);
  if (!row) throw notFound("App");
  return toApp(row);
}

function nextGroupOrder(): number {
  const row = getDb().prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS position FROM groups").get();
  return Math.min(Number(row?.position), maxSortOrder);
}

function nextAppOrder(groupId: string): number {
  const row = getDb().prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS position FROM apps WHERE group_id = ?").get(groupId);
  return Math.min(Number(row?.position), maxSortOrder);
}

function writeGroup(group: Group): void {
  getDb().prepare(`
    INSERT INTO groups (id, name, description, icon, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, description = excluded.description, icon = excluded.icon,
      sort_order = excluded.sort_order, created_at = excluded.created_at, updated_at = excluded.updated_at
  `).run(group.id, group.name, group.description, group.icon, group.sortOrder, group.createdAt, group.updatedAt);
}

function writeApp(app: App): void {
  getDb().prepare(`
    INSERT INTO apps (
      id, group_id, name, description, url, icon_type, icon_value, sso_enabled, health_check_enabled,
      health_check_url, open_in_new_tab, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      group_id = excluded.group_id, name = excluded.name, description = excluded.description,
      url = excluded.url, icon_type = excluded.icon_type, icon_value = excluded.icon_value,
      sso_enabled = excluded.sso_enabled, health_check_enabled = excluded.health_check_enabled,
      health_check_url = excluded.health_check_url, open_in_new_tab = excluded.open_in_new_tab,
      sort_order = excluded.sort_order, created_at = excluded.created_at, updated_at = excluded.updated_at
  `).run(
    app.id, app.groupId, app.name, app.description, app.url, app.iconType, app.iconValue,
    Number(app.ssoEnabled), Number(app.healthCheckEnabled), app.healthCheckUrl, Number(app.openInNewTab),
    app.sortOrder, app.createdAt, app.updatedAt,
  );
}

function newRecord() {
  const now = new Date().toISOString();
  return { id: randomUUID(), createdAt: now, updatedAt: now };
}

export function createGroup(input: z.infer<typeof newGroup>): Group {
  return transaction(getDb(), () => {
    const group = { ...input, ...newRecord(), sortOrder: input.sortOrder ?? nextGroupOrder() };
    writeGroup(group);
    return group;
  });
}

export function updateGroup(id: string, input: z.infer<typeof editGroup>): Group {
  return transaction(getDb(), () => {
    const group = { ...findGroup(id), ...input, updatedAt: new Date().toISOString() };
    writeGroup(group);
    return group;
  });
}

export function deleteGroup(id: string): void {
  if (!getDb().prepare("DELETE FROM groups WHERE id = ?").run(id).changes) throw notFound("Group");
}

export function createApp(input: z.infer<typeof newApp>): App {
  return transaction(getDb(), () => {
    findGroup(input.groupId);
    const app = appSchema.parse({ ...input, ...newRecord(), sortOrder: input.sortOrder ?? nextAppOrder(input.groupId) });
    writeApp(app);
    return app;
  });
}

export function updateApp(id: string, input: z.infer<typeof editApp>): App {
  return transaction(getDb(), () => {
    const current = findApp(id);
    const groupId = input.groupId ?? current.groupId;
    if (groupId !== current.groupId) findGroup(groupId);
    const sortOrder = input.sortOrder ?? (groupId === current.groupId ? current.sortOrder : nextAppOrder(groupId));
    const app = appSchema.parse({ ...current, ...input, sortOrder, updatedAt: new Date().toISOString() });
    writeApp(app);
    return app;
  });
}

export function deleteApp(id: string): void {
  if (!getDb().prepare("DELETE FROM apps WHERE id = ?").run(id).changes) throw notFound("App");
}

function assertUniqueIds(items: { id: string }[]): void {
  if (new Set(items.map(({ id }) => id)).size !== items.length) {
    throw new ApiError(400, "duplicate_id", "Duplicate IDs are not allowed");
  }
}

function applyOrder<T extends { id: string; sortOrder: number; updatedAt: string }>(
  current: T[],
  ordered: T[],
  write: (record: T) => void,
) {
  const moved = new Set(ordered.map(({ id }) => id));
  const remaining = current.filter(({ id }) => !moved.has(id));
  const positions = new Map(ordered.map((item) => [item.sortOrder, item]));
  const total = remaining.length + ordered.length;
  if (positions.size !== ordered.length || ordered.some(({ sortOrder }) => sortOrder >= total)) {
    throw new ApiError(400, "invalid_order", "Positions must be distinct zero-based indexes within the destination");
  }

  const now = new Date().toISOString();
  let cursor = 0;
  for (let index = 0; index < total; index++) {
    const movedItem = positions.get(index);
    const item = movedItem ?? remaining[cursor++];
    if (movedItem || item.sortOrder !== index) write({ ...item, sortOrder: index, updatedAt: now });
  }
}

export function reorderGroups(items: z.infer<typeof groupOrder>["items"]): Group[] {
  assertUniqueIds(items);
  return transaction(getDb(), () => {
    applyOrder(listGroups(), items.map((item) => ({ ...findGroup(item.id), ...item })), writeGroup);
    return listGroups();
  });
}

export function reorderApps(items: z.infer<typeof appOrder>["items"]): App[] {
  assertUniqueIds(items);
  return transaction(getDb(), () => {
    const affected = new Map<string, App[]>();
    const moved = new Set(items.map(({ id }) => id));
    for (const item of items) {
      const app = findApp(item.id);
      const groupId = item.groupId ?? app.groupId;
      if (!affected.has(app.groupId)) affected.set(app.groupId, []);
      if (!affected.has(groupId)) {
        findGroup(groupId);
        affected.set(groupId, []);
      }
      affected.get(groupId)!.push({ ...app, groupId, sortOrder: item.sortOrder });
    }
    for (const [groupId, ordered] of affected) {
      const remaining = listApps(groupId).filter(({ id }) => !moved.has(id));
      applyOrder(remaining, ordered, writeApp);
    }
    return listApps();
  });
}

export function getSettings(): Settings {
  const rows = getDb().prepare("SELECT key, value FROM settings").all();
  const settings = Object.fromEntries(rows.map(({ key, value }) => [String(key), JSON.parse(String(value))]));
  return settingsSchema.parse({ ...defaultSettings, ...settings });
}

function writeSettings(input: Partial<Settings>): void {
  const update = getDb().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  for (const [key, value] of Object.entries(input)) update.run(key, JSON.stringify(value));
}

export function updateSettings(input: Partial<Settings>): Settings {
  return transaction(getDb(), () => {
    writeSettings(input);
    return getSettings();
  });
}

export function readDashboard() {
  return transaction(getDb(), () => {
    const appsByGroup = new Map<string, App[]>();
    for (const app of listApps()) {
      const list = appsByGroup.get(app.groupId) ?? [];
      list.push(app);
      appsByGroup.set(app.groupId, list);
    }
    const groups = listGroups().map((group) => ({ ...group, apps: appsByGroup.get(group.id) ?? [] }));
    return { settings: getSettings(), groups };
  }, false);
}

export function exportBackup(): Backup {
  return transaction(getDb(), () => ({
    version: 1,
    exportedAt: new Date().toISOString(),
    groups: listGroups(),
    apps: listApps(),
    settings: getSettings(),
  }), false);
}

export function importBackup(mode: "merge" | "replace", backup: Backup) {
  assertUniqueIds(backup.groups);
  assertUniqueIds(backup.apps);

  const db = getDb();
  return transaction(db, () => {
    const validGroups = new Set(backup.groups.map(({ id }) => id));
    if (mode === "merge") {
      for (const { id } of listGroups()) validGroups.add(id);
    }
    if (backup.apps.some(({ groupId }) => !validGroups.has(groupId))) {
      throw new ApiError(400, "invalid_backup", "Every app in the backup must reference an existing group");
    }
    if (mode === "replace") db.exec("DELETE FROM groups; DELETE FROM settings;");
    for (const group of backup.groups) writeGroup(group);
    for (const app of backup.apps) writeApp(app);
    writeSettings(backup.settings);
    return { mode, groups: backup.groups.length, apps: backup.apps.length };
  });
}
