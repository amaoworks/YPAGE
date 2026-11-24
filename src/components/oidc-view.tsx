"use client";

import { useState } from "react";
import { copyText } from "@/lib/client/api";
import { envTemplate, tinyauthClientTemplate } from "@/lib/view";
import { usePortal } from "@/components/shell";

export function OidcView() {
  const { data, notify } = usePortal();
  const template = envTemplate(data.oidc);
  const clientYaml = tinyauthClientTemplate();
  const [copied, setCopied] = useState("");

  async function copy(label: string, value: string) {
    try {
      await copyText(value);
      setCopied(label);
      window.setTimeout(() => setCopied((current) => (current === label ? "" : current)), 1500);
    } catch (error) {
      notify(error instanceof Error ? error.message : "复制失败");
    }
  }

  const rows = [
    ["ISSUER", data.oidc.issuer ?? "未配置"],
    ["DISCOVERY", data.oidc.discoveryUrl ?? "未配置"],
    ["SCOPES", data.oidc.scope],
  ];

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h1>{data.oidc.brandName.toUpperCase()} · OIDC ENDPOINTS</h1>
          <p className="kicker">DISCOVERY TEMPLATE FOR SELF-HOSTED APPS</p>
        </div>
        <button type="button" className="inv-btn" onClick={() => void copy("env", template)}>
          {copied === "env" ? "COPIED ✓" : "COPY ENV"}
        </button>
      </div>
      <dl className="endpoint-list">
        {rows.map(([label, value]) => (
          <div key={label} className="endpoint">
            <dt>{label}</dt>
            <dd>{value}</dd>
            <button type="button" className="text-btn" onClick={() => void copy(label, value)} disabled={value === "未配置"}>
              {copied === label ? "COPIED ✓" : "COPY"}
            </button>
          </div>
        ))}
      </dl>
      <div className="code-block">
        <div className="code-head">
          <span>.ENV TEMPLATE</span>
          <button type="button" className="text-btn" onClick={() => void copy("env-block", template)}>
            {copied === "env-block" ? "COPIED ✓" : "COPY"}
          </button>
        </div>
        <pre className="code-mono">{template}</pre>
      </div>
      <div className="code-block">
        <div className="code-head">
          <span>TINYAUTH CONFIG.YAML CLIENT</span>
          <button type="button" className="text-btn" onClick={() => void copy("yaml", clientYaml)}>
            {copied === "yaml" ? "COPIED ✓" : "COPY YAML"}
          </button>
        </div>
        <pre className="code-mono">{clientYaml}</pre>
      </div>
      <p className="note">
        客户端 ID 和密钥写在 Tinyauth 的 config.yaml 里，不保存在 YPAGE。每个项目首次接入时需要确认授权；浏览器里已有 {data.oidc.brandName} 会话后，不会再次输入密码。
      </p>
    </section>
  );
}
