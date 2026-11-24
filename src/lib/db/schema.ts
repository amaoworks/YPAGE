import { z } from "zod";

const label = z.string().trim().min(1).max(120);
const description = z.string().trim().max(500);
export const recordId = z.uuid();
export const maxSortOrder = 1_000_000;
const sortOrder = z.number().int().min(0).max(maxSortOrder);
const timestamp = z.iso.datetime();

export const webUrl = z.string().trim().min(1).max(2048).refine((value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Expected an HTTP or HTTPS URL without credentials");

const groupFields = z.strictObject({
  name: label,
  description,
  icon: z.string().trim().max(120),
  sortOrder,
});

const appFields = z.strictObject({
  groupId: recordId,
  name: label,
  description,
  url: webUrl,
  iconType: z.enum(["favicon", "lucide", "image", "emoji"]),
  iconValue: z.string().trim().max(2048),
  ssoEnabled: z.boolean(),
  healthCheckEnabled: z.boolean(),
  healthCheckUrl: webUrl.nullable(),
  openInNewTab: z.boolean(),
  sortOrder,
});

export const newGroup = groupFields.partial({ sortOrder: true }).extend({
  description: description.default(""),
  icon: groupFields.shape.icon.default(""),
});
export const editGroup = groupFields.partial();

export const newApp = appFields.partial({ sortOrder: true }).extend({
  description: description.default(""),
  iconType: appFields.shape.iconType.default("favicon"),
  iconValue: appFields.shape.iconValue.default(""),
  ssoEnabled: z.boolean().default(false),
  healthCheckEnabled: z.boolean().default(false),
  healthCheckUrl: appFields.shape.healthCheckUrl.default(null),
  openInNewTab: z.boolean().default(true),
});
export const editApp = appFields.partial();

export const settingsSchema = z.strictObject({
  siteTitle: label,
  siteSubtitle: description,
  passBrandName: label,
  defaultTheme: z.enum(["light", "dark", "system"]),
  showHealthStatus: z.boolean(),
  healthCheckIntervalSec: z.number().int().min(5).max(3600),
});
export const editSettings = settingsSchema.partial();
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  siteTitle: "YPAGE",
  siteSubtitle: "个人项目导航",
  passBrandName: "YPAGE PASS",
  defaultTheme: "system",
  showHealthStatus: true,
  healthCheckIntervalSec: 30,
};

const meta = { id: recordId, createdAt: timestamp, updatedAt: timestamp };
export const groupSchema = groupFields.extend(meta);
export const appSchema = appFields.extend(meta).superRefine((app, context) => {
  if (app.iconType === "image" && !webUrl.safeParse(app.iconValue).success) {
    context.addIssue({ code: "custom", path: ["iconValue"], message: "Image icons require an HTTP or HTTPS URL" });
  }
});

export type Group = z.infer<typeof groupSchema>;
export type App = z.infer<typeof appSchema>;

const orderItem = z.strictObject({ id: recordId, sortOrder });
export const groupOrder = z.strictObject({ items: z.array(orderItem).min(1).max(1000) });
export const appOrder = z.strictObject({
  items: z.array(orderItem.extend({ groupId: recordId.optional() })).min(1).max(1000),
});

export const backupSchema = z.strictObject({
  version: z.literal(1),
  exportedAt: timestamp,
  groups: z.array(groupSchema),
  apps: z.array(appSchema),
  settings: settingsSchema,
});
export type Backup = z.infer<typeof backupSchema>;

export const importSchema = z.strictObject({
  mode: z.enum(["replace", "merge"]),
  backup: backupSchema,
});
