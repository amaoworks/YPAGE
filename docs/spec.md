# YPAGE & YPAGE PASS 项目需求与落盘规范

> 状态：后端、部署配置和 Swiss Mono 主页 / 管理界面已实现。

## 1. 核心目标

构建一套面向个人自开发、自部署项目的统一导航主页（**YPAGE**）与统一身份认证中心（**YPAGE PASS**，直接复用 [Tinyauth v5](https://github.com/tinyauthapp/tinyauth)），打包为 Docker 镜像并通过 `docker-compose.yml` 一键编排部署。

### 关键场景
1. **登录即免密跳转**：登录 YPAGE 主页后，点击卡片进入任意已接入 YPAGE PASS 的自部署项目，无需重复输入密码。
2. **统一认证入口**：所有自开发项目均可接入标准 OIDC（YPAGE PASS），提供「使用 YPAGE PASS 登录」能力。
3. **跨主域名兼容**：宿主机使用 **Nginx 反代**，YPAGE、YPAGE PASS 与各业务项目部署在**不同主域名**下。

---

## 2. 技术与架构决策

| 维度 | 最终决策 | 说明 |
| :--- | :--- | :--- |
| **认证中心 (YPAGE PASS)** | **Tinyauth v5.2** (`ghcr.io/tinyauthapp/tinyauth:v5.2.0`) | 原生通过 OIDC Basic OP 认证；使用 `config.yaml` 声明式管理用户与 OIDC Client |
| **跨主域免密机制** | **标准 OIDC + Tinyauth 登录会话** | 跨主域由浏览器跳转至 Tinyauth，复用其登录会话。客户端首次确认授权后可静默回跳 |
| **无登录功能老项目兜底** | Nginx + `oauth2-proxy`（可选） | 若未来有不想改代码的跨主域小工具，旁挂 `oauth2-proxy` 对接 Tinyauth OIDC 即可 |
| **YPAGE 形态与技术栈** | **方案 A：Next.js (App Router) + Tailwind CSS + shadcn/ui + SQLite** | 前后端一体化单 Docker 镜像（`output: "standalone"`），无 CORS 烦恼，开发与 UI 迭代效率最高 |
| **数据存储** | **SQLite**（挂载 `/app/data/ypage.db`） | 零外部数据库依赖，WAL 模式，支持 JSON 一键导入/导出备份 |
| **部署编排** | `docker-compose.yml`（2 个服务：`tinyauth` + `ypage`） | 仅绑定 `127.0.0.1`，由宿主机 Nginx 统一处理各域名 HTTPS 与反代 |

---

## 3. 访问控制与安全规范

- **全站强登录保护**：导航卡片不区分公开/私密，**全部必须登录后可见**。
- **路由拦截**：未登录访问 `/`、`/admin` 等任意页面直接 302 跳转至 `/api/auth/login`，拉起 YPAGE PASS OIDC (Authorization Code + PKCE `S256` + `state` + `nonce`) 登录流程；未登录访问 `/api/*`（除 `/api/health`、登录、回调和登出）统一返回 `401 Unauthorized`。
- **Session 管理**：服务端签发 `HttpOnly + Secure + SameSite=Lax` JWT Cookie，绝不向前端暴露 `OIDC_CLIENT_SECRET`。

---

## 4. 前端视觉风格（已定稿）

- **选定风格**：**风格三 — Swiss Mono（瑞士极简 · Vercel / Geist 编辑感）**
- **基准原型**：[docs/mockups/style-3-swiss-mono.html](./mockups/style-3-swiss-mono.html)
- **详细规范**：见 [docs/ui-design-spec.md](./ui-design-spec.md)（纯白/OLED纯黑双主题、1px 建筑网格线、零冗余装饰、等宽元数据标签、克制语义状态色）。

---

## 5. 功能范围清单

### 5.1 主页导航（`/`）
- **顶部导航栏**：品牌 Logo、**全局命令搜索框（`⌘K / Ctrl+K`）**（支持项目名/描述/域名检索并回车直达）、深/浅色主题切换、管理界面入口、当前登录用户与退出登录。
- **分组卡片网格**：支持按分组筛选，卡片展示图标（支持自动抓取 Favicon / Lucide 图标 / 自定义图片 URL / Emoji）、名称、一句话描述、**实时在线状态圆点**（服务端并发轻量探测 + 延迟毫秒数）及 `SSO` 标识。

### 5.2 内置管理界面（`/admin` 或抽屉模式）
- **分组管理**：新增、编辑、删除、排序。
- **项目卡片管理**：新增、编辑、删除、拖拽排序与跨分组移动、健康检查开关与自定义探测 URL、图标预览。
- **站点设置**：站点标题、副标题、默认主题、健康检查开关与间隔。
- **数据备份**：一键导出完整 JSON 快照、校验后导入恢复（支持覆盖 / 合并模式）。
- **YPAGE PASS 接入速查面板**：一键复制 OIDC Issuer / Discovery URL 与环境变量模板，方便新项目快速接入。

### 5.3 配套运维与交付物
- `Dockerfile`（Next.js standalone 多阶段最小镜像 + `HEALTHCHECK`）
- `docker-compose.yml`（`tinyauth` + `ypage` 双服务编排）
- `deploy/tinyauth/config.example.yaml`（YPAGE PASS 品牌定制 + OIDC Client 模板）
- `deploy/nginx/pass.example.conf` & `deploy/nginx/ypage.example.conf`（跨主域名 HTTPS 反代模板）
- `docs/oidc-integration-guide.md`（自开发项目接入 YPAGE PASS 速查指南）

---

## 6. 里程碑进度

- [x] 确定认证方案（Tinyauth v5 OIDC + 跨主域免密）与技术栈（方案 A：Next.js + SQLite 单镜像）
- [x] 确定前端视觉风格：**风格三 · Swiss Mono**（[ui-design-spec.md](./ui-design-spec.md)）
- [x] 实现 SQLite、OIDC、REST API 与 Docker Compose / Nginx 配置
- [x] 实现 Swiss Mono 主页和管理界面
