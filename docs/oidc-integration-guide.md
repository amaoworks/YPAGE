# 自开发项目接入 YPAGE PASS (Tinyauth OIDC) 指南

无论你的自开发项目部署在哪个主域名下（例如 `app.domain-c.com`），只需 2 步即可实现「使用 YPAGE PASS 登录」以及从 YPAGE 主页点击免密直达。

---

## 第一步：在 Tinyauth 中注册客户端

编辑 `deploy/tinyauth/config.yaml`，在 `oidc.clients` 下新增一段：

```yaml
oidc:
  clients:
    my_app:
      name: "我的新项目"
      clientId: "my-app"
      clientSecret: "用 openssl rand -hex 24 生成的随机密钥"
      trustedRedirectUris:
        - "https://app.domain-c.com/api/auth/callback"
```

将实际回调地址逐条登记在 `trustedRedirectUris` 中。用户已有 YPAGE PASS 登录会话时无需再次输入密码。Tinyauth v5.2 会在该客户端首次申请权限或扩大权限时显示授权确认页，之后会复用已保存的授权。

保存后重启 Tinyauth 容器使其生效。

```bash
docker compose restart tinyauth
```

---

## 第二步：在自开发项目中填入标准 OIDC 参数

所有标准 OIDC 库只需配置以下 4 个值即可通过 Discovery 自动发现全部端点：

- **Issuer / Discovery URL**：`https://pass.domain-a.com`（完整文档位于 `https://pass.domain-a.com/.well-known/openid-configuration`）
- **Client ID**：`my-app`
- **Client Secret**：上一步生成的密钥
- **Scope**：`openid profile email groups`

Tinyauth 支持 `client_secret_post`。使用该方式可确保客户端 ID 或密钥中的特殊字符通过表单正确解码。

### 常见技术栈快速示例

#### 1. Next.js / Node.js (`openid-client` v6)
参考本仓库 `src/lib/auth/oidc.ts`：
```ts
import * as client from "openid-client";

const config = await client.discovery(
  new URL(process.env.OIDC_ISSUER!),
  process.env.OIDC_CLIENT_ID!,
  process.env.OIDC_CLIENT_SECRET!,
  client.ClientSecretPost(process.env.OIDC_CLIENT_SECRET!)
);
```

#### 2. Auth.js / NextAuth v5
```ts
{
  id: "ypage-pass",
  name: "YPAGE PASS",
  type: "oidc",
  issuer: process.env.OIDC_ISSUER,
  clientId: process.env.OIDC_CLIENT_ID,
  clientSecret: process.env.OIDC_CLIENT_SECRET,
  client: { token_endpoint_auth_method: "client_secret_post" },
}
```

#### 3. Python (FastAPI + Authlib)
```python
oauth.register(
    name="ypage_pass",
    server_metadata_url=f"{OIDC_ISSUER}/.well-known/openid-configuration",
    client_id=OIDC_CLIENT_ID,
    client_secret=OIDC_CLIENT_SECRET,
    client_kwargs={
        "scope": "openid profile email groups",
        "token_endpoint_auth_method": "client_secret_post",
    },
)
```

#### 4. 没有登录功能的静态/老旧小工具（Nginx + `oauth2-proxy`）
对于跨主域名且不想改代码的小工具，不要用 Nginx `auth_request` 直连 Tinyauth（跨主域 Cookie 不可共享），而是给它旁挂一个轻量的 `oauth2-proxy`：
- `--provider=oidc`
- `--oidc-issuer-url=https://pass.domain-a.com`
- `--client-id=<clientId>`
- `--client-secret=<clientSecret>`
- `--redirect-url=https://tool.domain-d.com/oauth2/callback`

首次确认授权后，oauth2-proxy 客户端同样可复用 YPAGE PASS 的登录会话。
