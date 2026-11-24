# YPAGE & YPAGE PASS

个人自开发、自部署项目统一导航主页（**YPAGE**）与基于 [Tinyauth v5](https://github.com/tinyauthapp/tinyauth) 的统一 OIDC 认证中心（**YPAGE PASS**）。

## 核心特性

- **全站强登录保护**：未登录访问页面会启动 YPAGE PASS 登录，受保护的 API 返回 `401`。
- **跨主域名免密 SSO**：基于 OIDC Authorization Code + PKCE。YPAGE 和业务项目可部署在不同主域名下并复用 YPAGE PASS 登录会话。首次接入各客户端时需要确认授权。
- **单镜像一体化部署**：Next.js (App Router Standalone) + SQLite，与 Tinyauth 通过 `docker-compose.yml` 一键编排。
- **内置管理与运维工具**：分组/项目 CRUD 与拖拽排序、服务在线状态探测、Favicon 自动解析、JSON 导入/导出备份、YPAGE PASS OIDC 接入速查。

登录后访问 `/` 进入 Swiss Mono 目录，`/admin` 管理分组、项目、站点设置和 JSON 备份，`/oidc` 提供 YPAGE PASS 接入参数。

## 快速部署

1. **准备环境变量与 Tinyauth 配置**
   ```bash
   cp .env.example .env
   cp deploy/tinyauth/config.example.yaml deploy/tinyauth/config.yaml
   ```

2. **生成 Tinyauth 登录账号密码哈希**
   ```bash
   docker run --rm -it ghcr.io/tinyauthapp/tinyauth:v5.2.0 user create --interactive
   ```
   交互时选择普通输出，将 `用户名:哈希` 填入 `config.yaml` 的 `auth.users`。同步填写 `.env` 和 `config.yaml` 的 HTTPS 域名及 OIDC 客户端密钥。用 `openssl rand -hex 32` 生成两份独立的值，分别用作 OIDC 客户端密钥和 `SESSION_SECRET`。

3. **配置宿主机 Nginx HTTPS 反代**
   参考 `deploy/nginx/pass.example.conf` 与 `deploy/nginx/ypage.example.conf` 配置域名、证书和 HTTPS 反代。YPAGE 容器需要能通过 HTTPS 访问公开的 `OIDC_ISSUER`，以获取 Discovery 文档和签名公钥，并完成 Token 交换。

4. **启动服务**
   ```bash
   docker compose up -d --build --wait
   ```

## 本地开发

使用 Node.js 24 和 pnpm 10。开启本地开发身份后即可直接测试 API。

```bash
pnpm install
DEV_AUTH_BYPASS=true pnpm dev
curl http://localhost:3000/api/dashboard
```

本地 SQLite 默认位于 `data/ypage.db`。使用 `YPAGE_DB_PATH` 可切换数据库文件。调试局域网服务探测时，在环境变量 `PROBE_ALLOWED_PRIVATE_HOSTS` 中以逗号分隔允许访问的 `主机名[:端口]` 或 `IP[:端口]`。

## 相关文档

- 需求与总规范：[docs/spec.md](./docs/spec.md)
- 前端视觉设计规范（Swiss Mono 定稿）：[docs/ui-design-spec.md](./docs/ui-design-spec.md)
- 架构与 API 设计：[docs/architecture.md](./docs/architecture.md)
- 自开发项目接入 YPAGE PASS 指南：[docs/oidc-integration-guide.md](./docs/oidc-integration-guide.md)
- 前端风格原型归档：[docs/mockups/](./docs/mockups/)
