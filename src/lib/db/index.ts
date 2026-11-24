import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { defaultSettings } from "./schema";

const migration = `
  CREATE TABLE groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL,
    sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE apps (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    url TEXT NOT NULL,
    icon_type TEXT NOT NULL CHECK (icon_type IN ('favicon', 'lucide', 'image', 'emoji')),
    icon_value TEXT NOT NULL,
    sso_enabled INTEGER NOT NULL CHECK (sso_enabled IN (0, 1)),
    health_check_enabled INTEGER NOT NULL CHECK (health_check_enabled IN (0, 1)),
    health_check_url TEXT,
    open_in_new_tab INTEGER NOT NULL CHECK (open_in_new_tab IN (0, 1)),
    sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX apps_by_group_and_order ON apps (group_id, sort_order);
  CREATE INDEX groups_by_order ON groups (sort_order);

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT;
`;

function seed(db: DatabaseSync): void {
  const now = new Date().toISOString();
  const groupId = randomUUID();
  db.prepare(`INSERT INTO groups VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(groupId, "开发工具", "常用开发资源", "code", 0, now, now);
  const addApp = db.prepare(`INSERT INTO apps VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  addApp.run(randomUUID(), groupId, "GitHub", "代码托管与协作", "https://github.com/", "favicon", "", 0, 0, null, 1, 0, now, now);
  addApp.run(randomUUID(), groupId, "MDN Web Docs", "Web 开发参考", "https://developer.mozilla.org/", "favicon", "", 0, 0, null, 1, 1, now, now);
  const addSetting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
  for (const [key, value] of Object.entries(defaultSettings)) {
    addSetting.run(key, JSON.stringify(value));
  }
}

const connection = globalThis as typeof globalThis & { ypageDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (connection.ypageDb) return connection.ypageDb;
  const path = process.env.YPAGE_DB_PATH || resolve("data", "ypage.db");
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    transaction(db, () => {
      const version = db.prepare("PRAGMA user_version").get()?.user_version;
      if (version === 0) {
        db.exec(migration);
        seed(db);
        db.exec("PRAGMA user_version = 1");
      } else if (version !== 1) {
        throw new Error("Unsupported YPAGE database version");
      }
    });
    connection.ypageDb = db;
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function transaction<T>(db: DatabaseSync, work: () => T, write = true): T {
  db.exec(write ? "BEGIN IMMEDIATE" : "BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
