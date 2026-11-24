"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiSend } from "@/lib/client/api";
import type { PortalData, Probe, StatusPayload, StatusPhase } from "@/lib/portal-types";
import { searchApps, stepIndex, type SearchHit } from "@/lib/search";
import { displayName } from "@/lib/view";
import { Modal } from "@/components/modal";
import { ThemeToggle } from "@/components/theme-toggle";

type PortalContextValue = {
  data: PortalData;
  refresh: () => Promise<void>;
  statuses: Map<string, Probe>;
  statusPhase: StatusPhase;
  refreshStatus: (force?: boolean) => Promise<void>;
  notify: (message: string) => void;
  openSearch: () => void;
};

const PortalContext = createContext<PortalContextValue | null>(null);

export function usePortal(): PortalContextValue {
  const value = useContext(PortalContext);
  if (!value) throw new Error("Portal context is missing");
  return value;
}

const nav = [
  { href: "/", label: "目录" },
  { href: "/admin", label: "管理" },
  { href: "/oidc", label: "OIDC" },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function openTarget(url: string, openInNewTab: boolean): void {
  if (openInNewTab) window.open(url, "_blank", "noopener,noreferrer");
  else window.location.assign(url);
}

export function Shell({ initial, children }: { initial: PortalData; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState(initial);
  const [statuses, setStatuses] = useState<Map<string, Probe>>(() => new Map());
  const [statusPhase, setStatusPhase] = useState<StatusPhase>(initial.settings.showHealthStatus ? "loading" : "off");
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const toastId = useRef(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setData(initial);
  }, [initial]);

  const notify = useCallback((message: string) => {
    const id = toastId.current + 1;
    toastId.current = id;
    setToasts((items) => [...items.slice(-2), { id, message }]);
    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== id));
    }, 2600);
  }, []);

  const refresh = useCallback(async () => {
    const next = await apiSend<PortalData>("/api/dashboard", "GET");
    setData(next);
    router.refresh();
  }, [router]);

  const refreshStatus = useCallback(async (force = false) => {
    try {
      const payload = await apiSend<StatusPayload>(`/api/status${force ? "?force=true" : ""}`, "GET");
      if (!payload.enabled) {
        setStatuses(new Map());
        setStatusPhase("off");
        return;
      }
      setStatuses(new Map(payload.statuses.map((item) => [item.appId, item])));
      setStatusPhase("ready");
    } catch (error) {
      setStatusPhase("error");
      if (force) notify(error instanceof Error ? error.message : "状态刷新失败");
    }
  }, [notify]);

  useEffect(() => {
    if (!data.settings.showHealthStatus) {
      setStatuses(new Map());
      setStatusPhase("off");
      return;
    }
    let stopped = false;
    const tick = () => {
      if (!stopped && !document.hidden) void refreshStatus(false);
    };
    void refreshStatus(false);
    const timer = window.setInterval(tick, Math.max(5, data.settings.healthCheckIntervalSec) * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [data.settings.showHealthStatus, data.settings.healthCheckIntervalSec, refreshStatus]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setSearchOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function logout() {
    setMenuOpen(false);
    try {
      const result = await apiSend<{ logoutUrl: string | null }>("/api/auth/logout", "POST");
      if (result.logoutUrl) window.location.assign(result.logoutUrl);
      else notify("本地开发模式会保持登录");
    } catch (error) {
      notify(error instanceof Error ? error.message : "退出失败");
    }
  }

  const value = useMemo(
    () => ({ data, refresh, statuses, statusPhase, refreshStatus, notify, openSearch: () => setSearchOpen(true) }),
    [data, refresh, statuses, statusPhase, refreshStatus, notify],
  );

  return (
    <PortalContext.Provider value={value}>
      <div className="shell">
        <header className="header">
          <Link href="/" className="wordmark">
            <strong>{data.settings.siteTitle}</strong>
            <span>/ PASS-OIDC</span>
          </Link>
          <div className="h-controls">
            <button type="button" className="cmd-btn" aria-keyshortcuts="Control+K Meta+K" onClick={() => setSearchOpen(true)}>
              SEARCH <span>⌘K</span>
            </button>
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={isActive(pathname, item.href) ? "nav-link active" : "nav-link"}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
            <ThemeToggle />
            <div className="user-menu" ref={menuRef}>
              <button
                type="button"
                className={menuOpen ? "nav-link active" : "nav-link"}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                onClick={() => setMenuOpen((open) => !open)}
              >
                {displayName(data.user)}
              </button>
              {menuOpen ? (
                <div className="user-pop" role="menu">
                  <p>{data.user.name}</p>
                  {data.user.email ? <p>{data.user.email}</p> : null}
                  <button type="button" className="text-btn" role="menuitem" onClick={() => void logout()}>
                    退出登录
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        {children}
      </div>
      {searchOpen ? <CommandPalette groups={data.groups} onClose={() => setSearchOpen(false)} /> : null}
      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast" role="status">{toast.message}</div>
        ))}
      </div>
    </PortalContext.Provider>
  );
}

function CommandPalette({ groups, onClose }: { groups: PortalData["groups"]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => searchApps(groups, query), [groups, query]);
  const index = hits.length === 0 ? 0 : Math.min(selected, hits.length - 1);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    document.getElementById(`hit-${hits[index]?.appId}`)?.scrollIntoView({ block: "nearest" });
  }, [hits, index]);

  function choose(hit: SearchHit) {
    openTarget(hit.url, hit.openInNewTab);
    onClose();
  }

  return (
    <Modal onClose={onClose} className="command" labelledBy="command-title">
      <h2 id="command-title" className="sr-only">搜索项目</h2>
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded="true"
        aria-controls="search-list"
        aria-autocomplete="list"
        aria-activedescendant={hits[index] ? `hit-${hits[index].appId}` : undefined}
        placeholder="> filter service or domain..."
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelected(stepIndex(index, 1, hits.length));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelected(stepIndex(index, -1, hits.length));
          } else if (event.key === "Enter" && hits[index]) {
            event.preventDefault();
            choose(hits[index]);
          }
        }}
      />
      <div className="command-list" id="search-list" role="listbox">
        {hits.length === 0 ? <div className="command-empty">NO MATCHES</div> : null}
        {hits.map((hit, hitIndex) => (
          <button
            key={hit.appId}
            id={`hit-${hit.appId}`}
            type="button"
            role="option"
            aria-selected={hitIndex === index}
            className="command-row"
            onMouseEnter={() => setSelected(hitIndex)}
            onClick={() => choose(hit)}
          >
            <span>{hit.name}</span>
            <span>{hit.host}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
