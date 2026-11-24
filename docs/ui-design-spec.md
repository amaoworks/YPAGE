# YPAGE 前端视觉设计规范 — Swiss Mono（定稿）

> 定稿基准原型：[style-3-swiss-mono.html](./mockups/style-3-swiss-mono.html)  
> 风格定位：**Swiss Mono（瑞士极简 · Vercel / Geist 编辑感）** — 高对比黑白秩序、1px 建筑网格线、零阴影与冗余装饰、等宽元数据标签、克制的语义状态色。

---

## 1. 核心设计原则

1. **零视觉噪音**：不使用重阴影、复杂渐变背景或花哨玻璃拟态，全部层级通过 **1px 细线边框（`--line`）** 与 **极轻微表面色阶（`--bg` / `--bg-sub` / `--bg-hover`）** 区分。
2. **极度克制的色彩**：整页以纯黑白灰为主；**仅服务在线状态圆点** 使用语义色（在线绿 / 告警琥珀 / 离线红），保证一眼扫过即可识别系统健康度。
3. **编辑排版与等宽元数据**：标题与描述使用清晰的无衬线体（`Geist` / `Inter` / `PingFang SC`）；分组编号（`01 / CORE SERVICES`）、域名、延迟（`18ms`）、鉴权标识（`OIDC`）、快捷键（`⌘K`）统一使用等宽字体（`Geist Mono` / `JetBrains Mono`）。
4. **锐利且即时的反馈**：hover 仅做干脆的背景阶跃与右上角 `↗` 箭头微移（`translate(2px, -2px)`），无拖泥带水的大幅缩放动画。

---

## 2. 色彩与 Design Tokens

支持 **浅色模式（默认纯白）** 与 **深色模式（纯黑 OLED）**，并跟随系统偏好自动初始化：

| Token | Light（纯白极简） | Dark（OLED 纯黑） | 用途 |
| :--- | :--- | :--- | :--- |
| `--bg` | `#ffffff` | `#000000` | 主画布与单元格底色 |
| `--bg-sub` | `#fafafa` | `#0a0a0a` | 次级信息条（MetaBar、Footer、代码块、搜索触发器） |
| `--bg-hover` | `#f4f4f5` | `#141414` | 卡片 / 列表行悬浮态 |
| `--ink` | `#0a0a0a` | `#ededed` | 主文字、标题、焦点高亮 |
| `--ink-muted` | `#52525b` | `#888888` | 描述文案、次级标签、表头 |
| `--ink-faint` | `#a1a1aa` | `#555555` | 域名、弱化箭头、辅助符号 |
| `--line` | `#e4e4e7` | `#222222` | 所有 1px 网格分割线与描边 |
| `--line-strong` | `#0a0a0a` | `#ededed` | 强聚焦边框（弹窗、搜索框 hover） |
| `--inv-bg` / `--inv-ink` | `#0a0a0a` / `#ffffff` | `#ededed` / `#000000` | 选中导航项、主操作按钮反色强调 |
| `--status-online` | `#16a34a` | `#22c55e` | 服务在线小圆点 |
| `--status-degraded` | `#d97706` | `#f59e0b` | 服务高延迟 / 非 2xx-3xx 异常 |
| `--status-offline` | `#dc2626` | `#ef4444` | 服务不可达 / 超时 |

---

## 3. 排版与圆角规范

- **正文字体栈**：`"Geist", "Inter", -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
- **等宽字体栈**：`"Geist Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`
- **字号层级**：
  - 品牌 Wordmark：`15px` / `700` / `letter-spacing: 0.06em`
  - 项目卡片标题：`14px` / `600` / `letter-spacing: -0.02em`
  - 项目描述：`12px` / `400` / `line-height: 1.45`
  - 分组索引条与等宽元数据：`10.5px ~ 11px` / `uppercase`（英文标签）
- **圆角克制**：容器网格采用直角拼接（`0px`）保持建筑网格连续性；按钮、标签、弹窗采用小圆角（`4px ~ 8px`）。

---

## 4. 页面结构与核心组件

### 4.1 顶部栏（Header）
- 左侧：品牌 Wordmark（`YPAGE`）+ 等宽副标（`/ PASS-OIDC`）。
- 右侧：等宽搜索触发按钮（`SEARCH ⌘K`）、视图切换（`目录` / `管理` / `OIDC`）、深浅色切换按钮（`◐`）、当前用户菜单（含退出登录）。

### 4.2 状态与筛选条（MetaBar）
- 左侧：下划线式分组切换 Tab（`ALL [06]`、`CORE [02]` 等，选中项加粗并带 `1.5px` 底部实线）。
- 右侧：全局健康状态汇总（绿点 + `5/6 HEALTHY · <USERNAME>`）与手动刷新状态按钮。

### 4.3 分组建筑网格（Section Bar + Swiss Grid）
- 每个分组以通栏索引条开头：左侧序号与分组名（如 `01 / CORE SERVICES`），右侧节点数（`2 NODES`）。
- 网格布局：桌面端 **2~3 列自适应**（`>= 1024px` 3 列，`640px ~ 1023px` 2 列，`< 640px` 1 列），单元格之间仅用共享 `1px solid var(--line)` 分割，无外边距缝隙。
- 单个卡片单元格内容：
  - 顶部：项目图标（可选极简小尺寸 18~20px 单色/Favicon）+ 项目名称 + 右上角外链箭头 `↗`
  - 中部：一句话描述（最多两行截断）
  - 底部：左侧等宽域名（如 `notes.domain-c.com`），右侧等宽描边徽章（`OIDC` + 状态圆点与延迟 `18ms`）

### 4.4 全局命令面板（`⌘K / Ctrl+K`）
- 居中极简矩形弹窗（`1px solid var(--line-strong)` 锐利边框），顶部等宽输入行（`> filter service or domain...`）。
- 支持键盘上下键选择、`Enter` 直接跳转目标项目、`Esc` 关闭；实时匹配项目名、描述、分组名与域名。

### 4.5 管理视图（`/admin`）
- 延续 Swiss Mono 表格与抽屉风格：
  - **分组与项目注册表（Index Registry）**：高密度数据表，支持拖拽手柄排序、快捷开关 `SSO` / `健康检查`、行内编辑抽屉与删除确认。
  - **右上角操作区**：`EXPORT .JSON`、`IMPORT .JSON`、`+ NEW GROUP`、`+ NEW APP`。
  - **站点设置区**：简洁双栏表单，维护站点标题、副标题、默认主题、探测频率。

### 4.6 YPAGE PASS 接入速查面板（`OIDC` 视图）
- 展示当前实例的 `OIDC_ISSUER`、`OIDC_DISCOVERY` URL、推荐 Scopes 以及可直接复制的 `.env` 模板代码块，带一键 `COPY ENV` 反馈按钮。

---

## 5. 实现约束（基于方案 A）

- 使用 **Tailwind CSS v4** CSS 变量映射到上述 Token，配合 **shadcn/ui** 底层无障碍原语（Dialog / Command / DropdownMenu / Switch / Tabs / Toast），覆写为 Swiss Mono 锐利边框与零阴影风格。
- 图标库使用 `lucide-react`（统一 `strokeWidth={1.75}` 保持线条细腻一致）。
