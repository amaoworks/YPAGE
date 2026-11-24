# YPAGE 架构与后端设计文档

## 1. 整体架构

YPAGE 采用 **前后端一体化单镜像（Next.js App Router Standalone + SQLite）** 架构，与 **Tinyauth v5（YPAGE PASS）** 通过 `docker-compose.yml` 编排在一起，由宿主机 Nginx 负责 HTTPS 终止与跨主域名反向代理。

```text
Browser
  │
  ├── HTTPS ──► Nginx (pass.domain-a.com) ──► Tinyauth v5 (127.0.0.1:3001)  [OIDC Provider / YPAGE PASS]
  ├── HTTPS ──► Nginx (home.domain-b.com) ──► YPAGE Next.js (127.0.0.1:3000) [个人主页 + 管理后台 + SQLite]
  └── HTTPS ──► Nginx (app.domain-c.com)  ──► 自开发项目 (接入标准 OIDC)
```

### 跨主域名免密登录流转

1. 用户访问 `https://home.domain-b.com`，`src/proxy.ts` 检测到无有效 `ypage_session` Cookie，302 跳转至 `/api/auth/login?next=/`。
2. `/api/auth/login` 通过 `openid-client` 发起标准 **OIDC Authorization Code + PKCE (`S256`) + `state` + `nonce`** 流程，跳转至 `https://pass.domain-a.com`（YPAGE PASS）。
3. 用户在 YPAGE PASS 完成登录，浏览器获得 `pass.domain-a.com` 会话 Cookie。首次授权 YPAGE 后回跳 `/api/auth/callback`。
4. YPAGE 服务端换取 Token、校验 ID Token 并签发 `HttpOnly + Secure + SameSite=Lax` 的 `ypage_session` JWT Cookie，重定向回主页。
5. 用户点击主页卡片跳转到其他主域名项目 `https://app.domain-c.com`：该项目触发 OIDC 登录跳转至 `pass.domain-a.com` 时，浏览器自动携带 YPAGE PASS 会话 Cookie。该项目首次接入时需确认授权，之后可静默回跳。

## 2. 全站强鉴权策略

- **页面路径**：`/`、`/admin` 等全部受 `src/proxy.ts` 与服务端 `getCurrentSession()` 双重保护，未登录一律 302 跳转至 OIDC 登录，不暴露任何卡片信息。
- **API 路径**：除 `/api/health`、登录、回调和登出外，所有 `/api/*` 均通过中间件与路由层 `requireApiAuth()` 双重拦截，未登录返回 `401 Unauthorized`。
- **本地开发便捷模式**：仅当 `NODE_ENV !== "production"` 且 `DEV_AUTH_BYPASS=true` 时允许跳过 OIDC 调试界面；生产环境会忽略该开关。

## 3. SQLite 数据模型 (`src/lib/db/index.ts`)

数据文件默认挂载于 `/app/data/ypage.db`（开启 WAL 模式与外键约束）：

- `groups`：导航分组（`id`, `name`, `description`, `icon`, `sort_order`, `created_at`, `updated_at`）
- `apps`：项目卡片（`id`, `group_id`, `name`, `description`, `url`, `icon_type`, `icon_value`, `sso_enabled`, `health_check_enabled`, `health_check_url`, `open_in_new_tab`, `sort_order`, `created_at`, `updated_at`）
- `settings`：站点全局配置键值对（`siteTitle`, `siteSubtitle`, `passBrandName`, `defaultTheme`, `showHealthStatus`, `healthCheckIntervalSec`）

首次启动空库时会自动写入示例分组与卡片，便于开箱即用。

## 4. 后端 REST API 一览

| 方法与路径 | 说明 | 鉴权 |
| :--- | :--- | :--- |
| `GET /api/health` | Docker 容器健康检查（探测 SQLite 连通性） | 公开 |
| `GET /api/auth/login` | 发起 OIDC PKCE 登录跳转 | 公开 |
| `GET /api/auth/callback` | OIDC 回调换取 Token 并签发 Session Cookie | 公开 |
| `GET / POST /api/auth/logout` | 清除本地 Session 并返回/跳转至 YPAGE PASS 登出 | 公开 |
| `GET /api/auth/me` | 当前登录用户信息 + YPAGE PASS 公开接入配置 | 需登录 |
| `GET /api/dashboard` | 一次性返回主页所需数据（用户、配置、分组及卡片、OIDC 速查） | 需登录 |
| `GET / POST /api/groups` | 列出 / 新增分组 | 需登录 |
| `PATCH / DELETE /api/groups/:id` | 更新 / 删除分组（级联删除下属卡片） | 需登录 |
| `PUT /api/groups/reorder` | 批量更新分组排序 | 需登录 |
| `GET / POST /api/apps` | 列出（支持 `?groupId=`）/ 新增项目卡片 | 需登录 |
| `PATCH / DELETE /api/apps/:id` | 更新 / 删除项目卡片 | 需登录 |
| `PUT /api/apps/reorder` | 批量更新卡片排序与跨分组拖拽移动 | 需登录 |
| `GET / PATCH /api/settings` | 读取 / 更新站点全局设置 | 需登录 |
| `GET /api/status` | 并发探测已开启健康检查的服务在线状态（`healthCheckIntervalSec` 控制 TTL，默认 30 秒，`?force=true` 强刷） | 需登录 |
| `GET /api/favicon?url=...` | 轻量服务端 Favicon 代理与 SVG 兜底 | 需登录 |
| `GET /api/backup/export` | 导出完整 JSON 快照（分组、卡片、设置） | 需登录 |
| `POST /api/backup/import` | Zod 校验后事务导入 JSON 备份（支持 `replace` / `merge` 模式） | 需登录 |

## 5. API 请求与响应

- 列表接口返回数组，创建接口返回新记录和 `201`，更新接口返回更新后的记录，删除接口返回 `204`。
- JSON 写入请求使用 `Content-Type: application/json`。错误响应为 `{ "error": { "code": "...", "message": "..." } }`，字段校验错误还包含 `details`。
- 新建分组只需 `name`。新建项目需 `groupId`、`name`、`url`。字段名使用 camelCase，支持 `favicon`、`lucide`、`image` 和 `emoji` 四种 `iconType`。
- 重排请求为 `{ "items": [{ "id": "...", "sortOrder": 0 }] }`。项目项可带 `groupId` 移至其他分组，`sortOrder` 为目标分组中的零基位置。可只提交需移动的记录，剩余记录保留相对顺序。
- `/api/dashboard` 返回 `{ user, settings, groups, oidc }`，每个分组内含 `apps`。 `/api/auth/me` 返回 `{ user, oidc }`。公开 OIDC 信息包含品牌名、Issuer、Discovery URL 和 Scope。
- `/api/status` 返回 `{ enabled, intervalSec, statuses }`。每条状态包含 `appId`、`status`、`httpStatus`、`latencyMs` 和 `checkedAt`。探测优先使用 `HEAD`，收到 `405` 或 `501` 时改用 `GET`。
- 备份导出为 `{ version: 1, exportedAt, groups, apps, settings }`。导入请求为 `{ "mode": "replace", "backup": { ... } }`，请求体最大 5 MiB。`replace` 完整替换，`merge` 按 UUID 更新或新增记录并保留其他分组和卡片。
- `GET /api/auth/logout` 清除 YPAGE 会话并跳转至 Tinyauth 的 `/logout` 确认页。`POST /api/auth/logout` 清除 YPAGE 会话并返回 `{ logoutUrl }`，供客户端导航至确认页。

健康探测和 Favicon 请求默认只连接公网地址。通过 `PROBE_ALLOWED_PRIVATE_HOSTS` 可以允许指定的内网 `主机名[:端口]` 或 `IP[:端口]`，例如 `nas.lan:8080,10.0.0.5:3000`。跳转目标也会重新检查。Favicon 代理返回识别出的位图或内置 SVG。
