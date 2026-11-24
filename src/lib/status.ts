import { performance } from "node:perf_hooks";
import { listApps, getSettings } from "@/lib/db/store";
import { probe } from "@/lib/http/probe";

type Check = {
  status: "online" | "offline";
  httpStatus: number | null;
  latencyMs: number;
  checkedAt: string;
};
const cache = new Map<string, { value: Check; time: number }>();
const pending = new Map<string, Promise<Check>>();

async function check(url: string): Promise<Check> {
  const started = performance.now();
  let httpStatus: number | null = null;
  try {
    const signal = AbortSignal.timeout(4000);
    const head = await probe(url, "HEAD", signal);
    head.response.destroy();
    httpStatus = head.status;
    if (httpStatus === 405 || httpStatus === 501) {
      const get = await probe(url, "GET", signal);
      get.response.destroy();
      httpStatus = get.status;
    }
  } catch {
    httpStatus = null;
  }
  return {
    status: httpStatus !== null && httpStatus >= 200 && httpStatus < 400 ? "online" : "offline",
    httpStatus,
    latencyMs: Math.round(performance.now() - started),
    checkedAt: new Date().toISOString(),
  };
}

function cachedCheck(url: string, ttl: number, force: boolean): Promise<Check> {
  const active = pending.get(url);
  if (active) return active;
  const cached = cache.get(url);
  if (!force && cached && performance.now() - cached.time < ttl) {
    return Promise.resolve(cached.value);
  }
  const job = check(url).then((value) => {
    cache.set(url, { value, time: performance.now() });
    return value;
  }).finally(() => pending.delete(url));
  pending.set(url, job);
  return job;
}

export async function readStatus(force: boolean) {
  const { showHealthStatus, healthCheckIntervalSec } = getSettings();
  const ttl = healthCheckIntervalSec * 1000;
  const apps = showHealthStatus ? listApps().filter((app) => app.healthCheckEnabled) : [];
  const urls = apps.map((app) => app.healthCheckUrl ?? app.url);
  const activeUrls = new Set(urls);
  const targets = [...activeUrls];
  for (const url of cache.keys()) {
    if (!activeUrls.has(url)) cache.delete(url);
  }

  const results = new Map<string, Check>();
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const url = targets[cursor++];
      results.set(url, await cachedCheck(url, ttl, force));
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, targets.length) }, worker));
  const statuses = apps.map(({ id }, index) => ({ appId: id, ...results.get(urls[index])! }));
  return { enabled: showHealthStatus, intervalSec: healthCheckIntervalSec, statuses };
}
