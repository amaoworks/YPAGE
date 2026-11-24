"use client";

import { useState } from "react";
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";
import type { App } from "@/lib/db/schema";
import { isHttpUrl, toIconName } from "@/lib/view";

const knownIcons = new Set<string>(iconNames);

export function isKnownLucideIcon(name: string): boolean {
  const normalized = toIconName(name);
  return Boolean(normalized) && knownIcons.has(normalized);
}

function LucideGlyph({ name, size }: { name: string; size: number }) {
  const normalized = toIconName(name);
  if (!knownIcons.has(normalized)) {
    return <span className="icon-fallback" style={{ width: size, height: size }} aria-hidden="true" />;
  }
  return (
    <span style={{ width: size, height: size, display: "inline-flex", flex: "none" }}>
      <DynamicIcon name={normalized as IconName} size={size} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

function Raster({ src, size, remote }: { src: string; size: number; remote: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="icon-fallback" style={{ width: size, height: size }} aria-hidden="true" />;
  return (
    <img
      className="app-icon"
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      decoding="async"
      referrerPolicy={remote ? "no-referrer" : undefined}
      onError={() => setFailed(true)}
    />
  );
}

export function AppIcon({
  app,
  size = 18,
}: {
  app: Pick<App, "iconType" | "iconValue" | "url" | "name">;
  size?: number;
}) {
  if (app.iconType === "emoji" && app.iconValue.trim()) {
    return (
      <span className="emoji-icon" style={{ fontSize: size, width: size }} aria-hidden="true">
        {app.iconValue.trim()}
      </span>
    );
  }
  if (app.iconType === "lucide" && app.iconValue.trim()) return <LucideGlyph name={app.iconValue} size={size} />;
  if (app.iconType === "image" && isHttpUrl(app.iconValue)) {
    return <Raster key={app.iconValue} src={app.iconValue} size={size} remote />;
  }
  if (!isHttpUrl(app.url)) return <span className="icon-fallback" style={{ width: size, height: size }} aria-hidden="true" />;
  const faviconSrc = `/api/favicon?url=${encodeURIComponent(app.url)}`;
  return <Raster key={faviconSrc} src={faviconSrc} size={size} remote={false} />;
}
