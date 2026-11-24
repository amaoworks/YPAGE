"use client";

import { useEffect, useState } from "react";
import type { Settings } from "@/lib/db/schema";

function resolvedDark(): boolean {
  const root = document.documentElement;
  if (root.classList.contains("dark")) return true;
  if (root.classList.contains("light")) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeToggle({ defaultTheme }: { defaultTheme?: Settings["defaultTheme"] }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setDark(resolvedDark());
    sync();
    media.addEventListener("change", sync);
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      media.removeEventListener("change", sync);
      observer.disconnect();
    };
  }, [defaultTheme]);

  function toggle() {
    const next = dark ? "light" : "dark";
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `ypage-theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
    setDark(next === "dark");
  }

  const label = dark ? "切换到浅色模式" : "切换到深色模式";

  return (
    <button type="button" className="nav-link" onClick={toggle} aria-pressed={dark} aria-label={label} title={label}>
      ◐
    </button>
  );
}
