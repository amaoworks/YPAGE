import { performance } from "node:perf_hooks";
import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { probe, readUpTo } from "@/lib/http/probe";

const maxIconBytes = 256 * 1024;
const maxCacheEntries = 256;
const iconTtlMs = 30 * 60 * 1000;
const fallbackTtlMs = 5 * 60 * 1000;

type FoundIcon = { body: Uint8Array<ArrayBuffer> | string; type: string; isFallback?: boolean };
type Node = DefaultTreeAdapterTypes.Node;

const cache = new Map<string, { value: FoundIcon; expiresAt: number }>();
const pending = new Map<string, Promise<FoundIcon>>();

const fallback: FoundIcon = {
  type: "image/svg+xml",
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="#777" stroke-width="1.5"><rect x="4" y="4" width="24" height="24" rx="3"/><path d="M4 11h24m-18 6 4 3-4 3m7 0h5"/></svg>',
  isFallback: true,
};

function iconType(body: Buffer): string | undefined {
  if (body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (body.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]))) return "image/x-icon";
  if (body.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(body.toString("ascii", 0, 6))) return "image/gif";
  if (body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP") return "image/webp";
}

type IconCandidate = { href: string; priority: number };

function collectIcons(node: Node, out: IconCandidate[]): void {
  if ("tagName" in node && node.tagName === "link") {
    const rel = node.attrs.find(({ name }) => name === "rel")?.value.toLowerCase().split(/\s+/) ?? [];
    const href = node.attrs.find(({ name }) => name === "href")?.value?.trim();
    const type = node.attrs.find(({ name }) => name === "type")?.value?.toLowerCase() ?? "";
    const isIcon = rel.includes("icon");
    const isApple = rel.includes("apple-touch-icon") || rel.includes("apple-touch-icon-precomposed");
    if (href && (isIcon || isApple) && !rel.includes("mask-icon")) {
      const looksSvg = type.includes("svg") || /\.svg(?:[?#]|$)/i.test(href);
      // Prefer raster standard icons over apple-touch-icons, and deprioritize SVGs (unsupported by raster sniff).
      const priority = looksSvg ? 3 : isIcon ? 0 : 1;
      out.push({ href, priority });
    }
  }
  if ("childNodes" in node) {
    for (const child of node.childNodes) collectIcons(child, out);
  }
}

async function downloadIcon(url: string, signal: AbortSignal): Promise<FoundIcon | undefined> {
  try {
    const { response, status } = await probe(url, "GET", signal);
    if (status < 200 || status >= 300 || Number(response.headers["content-length"]) > maxIconBytes) {
      response.destroy();
      return;
    }
    const bytes = await readUpTo(response, maxIconBytes);
    const type = iconType(bytes);
    if (type) return { body: new Uint8Array(bytes), type };
  } catch {
    return;
  }
}

async function fetchFavicon(rawUrl: string): Promise<FoundIcon> {
  const signal = AbortSignal.timeout(5000);
  let target = new URL(rawUrl);
  const candidates: string[] = [];
  try {
    const { response, status, url } = await probe(target.href, "GET", signal);
    target = url;
    if (status >= 200 && status < 300 && response.headers["content-type"]?.toLowerCase().includes("text/html")) {
      const html = await readUpTo(response, 96 * 1024, true);
      const found: IconCandidate[] = [];
      collectIcons(parse(html.toString("utf-8")), found);
      found.sort((left, right) => left.priority - right.priority);
      for (const item of found) {
        if (item.priority >= 3) continue;
        try {
          const resolved = new URL(item.href, target);
          if (resolved.protocol === "http:" || resolved.protocol === "https:") {
            candidates.push(resolved.href);
          }
        } catch {
          // Ignore malformed hrefs.
        }
      }
    } else {
      response.destroy();
    }
  } catch {
    // The default icon path may still be available.
  }

  candidates.push(new URL("/favicon.ico", target).href);
  let attempts = 0;
  for (const candidate of new Set(candidates)) {
    if (attempts >= 4 || signal.aborted) break;
    attempts += 1;
    const downloaded = await downloadIcon(candidate, signal);
    if (downloaded) return downloaded;
  }
  return fallback;
}

export async function getFavicon(rawUrl: string): Promise<FoundIcon> {
  const key = new URL(rawUrl).origin + new URL(rawUrl).pathname;
  const now = performance.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const active = pending.get(key);
  if (active) return active;

  const job = fetchFavicon(rawUrl)
    .then((value) => {
      if (cache.size >= maxCacheEntries) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, {
        value,
        expiresAt: performance.now() + (value.isFallback ? fallbackTtlMs : iconTtlMs),
      });
      return value;
    })
    .finally(() => pending.delete(key));

  pending.set(key, job);
  return job;
}
