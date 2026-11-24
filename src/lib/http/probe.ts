import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { webUrl } from "@/lib/db/schema";

const privateRanges = new Set(["private", "uniqueLocal", "loopback", "carrierGradeNat"]);
const redirects = new Set([301, 302, 303, 307, 308]);
const globalIPv6 = ipaddr.IPv6.parse("2000::");

function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    void pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function resolveAddress(url: URL, signal: AbortSignal): Promise<string> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await abortable(lookup(hostname, { all: true }), signal);
  const privateHosts = (process.env.PROBE_ALLOWED_PRIVATE_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const defaultPort = url.protocol === "https:" ? "443" : "80";
  const allowPrivate = privateHosts.includes(url.host) ||
    (!url.port && privateHosts.includes(`${url.hostname}:${defaultPort}`));
  const isAllowed = (address: string) => {
    const ip = ipaddr.process(address);
    if (ip.toString() === "168.63.129.16" || ip.toString() === "fd00:ec2::254") return false;
    const range = ip.range();
    if (range === "unicast") {
      return ip instanceof ipaddr.IPv4 || ip.match(globalIPv6, 3);
    }
    return allowPrivate && privateRanges.has(range);
  };

  const candidate = addresses.find(({ address }) => isAllowed(address));
  if (!candidate) throw new Error("Probe destination is not allowed");
  return candidate.address;
}

async function makeRequest(url: URL, method: "GET" | "HEAD", signal: AbortSignal) {
  signal.throwIfAborted();
  const address = await resolveAddress(url, signal);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const transport = url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise<IncomingMessage>((resolve, reject) => {
    const request = transport({
      hostname: address,
      servername: isIP(hostname) ? undefined : hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      agent: false,
      signal,
      headers: { Host: url.host, "User-Agent": "YPAGE/0.1", "Accept-Encoding": "identity" },
    }, resolve);
    request.on("error", reject);
    request.end();
  });
}

export async function probe(rawUrl: string, method: "GET" | "HEAD", signal: AbortSignal) {
  let url = new URL(webUrl.parse(rawUrl));
  for (let hop = 0; hop <= 3; hop++) {
    const response = await makeRequest(url, method, signal);
    const status = response.statusCode ?? 502;
    if (!redirects.has(status) || !response.headers.location) return { response, url, status };
    response.destroy();
    url = new URL(webUrl.parse(new URL(response.headers.location, url).href));
  }
  throw new Error("Probe redirected too many times");
}

export async function readUpTo(response: IncomingMessage, limit: number, truncate = false): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of response) {
      const buffer: Buffer = chunk;
      if (size + buffer.length > limit) {
        if (!truncate) throw new Error("Probe response is too large");
        chunks.push(buffer.subarray(0, limit - size));
        break;
      }
      chunks.push(buffer);
      size += buffer.length;
    }
    return Buffer.concat(chunks);
  } finally {
    response.destroy();
  }
}
