import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { probe, readUpTo } from "@/lib/http/probe";

const maxIconBytes = 256 * 1024;
type FoundIcon = { body: Uint8Array<ArrayBuffer> | string; type: string };
type Node = DefaultTreeAdapterTypes.Node;

const fallback: FoundIcon = {
  type: "image/svg+xml",
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="#777" stroke-width="1.5"><rect x="4" y="4" width="24" height="24" rx="3"/><path d="M4 11h24m-18 6 4 3-4 3m7 0h5"/></svg>',
};

function iconType(body: Buffer): string | undefined {
  if (body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (body.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]))) return "image/x-icon";
  if (body.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(body.toString("ascii", 0, 6))) return "image/gif";
  if (body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP") return "image/webp";
}

function findIcon(node: Node): string | undefined {
  if ("tagName" in node && node.tagName === "link") {
    const rel = node.attrs.find(({ name }) => name === "rel")?.value.toLowerCase().split(/\s+/);
    if (rel?.some((item) => ["icon", "apple-touch-icon", "apple-touch-icon-precomposed"].includes(item))) {
      return node.attrs.find(({ name }) => name === "href")?.value;
    }
  }
  if ("childNodes" in node) {
    for (const child of node.childNodes) {
      const result = findIcon(child);
      if (result) return result;
    }
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

export async function getFavicon(rawUrl: string): Promise<FoundIcon> {
  const signal = AbortSignal.timeout(5000);
  let target = new URL(rawUrl);
  let icon: URL | undefined;
  try {
    const { response, status, url } = await probe(target.href, "GET", signal);
    target = url;
    if (status >= 200 && status < 300 && response.headers["content-type"]?.toLowerCase().includes("text/html")) {
      const html = await readUpTo(response, 96 * 1024, true);
      const href = findIcon(parse(html.toString("utf-8")));
      if (href) icon = new URL(href, target);
    } else {
      response.destroy();
    }
  } catch {
    // The default icon path may still be available.
  }

  const standardIcon = new URL("/favicon.ico", target).href;
  for (const candidate of new Set([icon?.href, standardIcon])) {
    if (!candidate) continue;
    const downloaded = await downloadIcon(candidate, signal);
    if (downloaded) return downloaded;
  }
  return fallback;
}
