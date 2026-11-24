export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type ErrorBody = {
  error?: {
    message?: string;
    details?: { path?: (string | number)[]; message?: string }[];
  };
};

export async function apiSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new RequestError("网络请求失败", 0);
  }

  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => null)) as (T & ErrorBody) | null;
  if (!response.ok) {
    const detail = payload?.error?.details?.find((item) => item.message);
    const detailText = detail ? `${detail.path?.join(".") || "field"}: ${detail.message}` : "";
    throw new RequestError(detailText || payload?.error?.message || "请求失败", response.status);
  }
  return payload as T;
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "true");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    if (!copied) throw new RequestError("复制失败", 0);
  }
}
