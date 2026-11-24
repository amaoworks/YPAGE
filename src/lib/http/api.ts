import { z } from "zod";
import { appOrigin, devAuthBypass } from "@/lib/config";
import { getCurrentSession } from "@/lib/auth/session";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const noStore = "private, no-store";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": noStore } });
}

export function unauthorized(): Response {
  return json({ error: { code: "unauthorized", message: "Sign in required" } }, 401);
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin) {
    const expectedOrigin = devAuthBypass && !process.env.YPAGE_URL
      ? `${new URL(request.url).protocol}//${request.headers.get("host")}`
      : appOrigin();
    if (origin !== expectedOrigin) throw new ApiError(403, "forbidden", "Origin is not allowed");
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError(403, "forbidden", "Cross-site request is not allowed");
  }
}

export function api<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Response | Promise<Response>,
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertSameOrigin(request);
      return await handler(request, ...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return json(
          { error: { code: error.code, message: error.message, details: error.details } },
          error.status,
        );
      }
      if (error instanceof z.ZodError) {
        const details = error.issues.map(({ path, message }) => ({ path, message }));
        return json({ error: { code: "invalid_input", message: "Invalid input", details } }, 400);
      }
      console.error("YPAGE API request failed", error);
      return json({ error: { code: "internal_error", message: "Internal server error" } }, 500);
    }
  };
}

type User = NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>;

export function requireApiAuth<Args extends unknown[]>(
  handler: (request: Request, user: User, ...args: Args) => Response | Promise<Response>,
) {
  return api(async (request: Request, ...args: Args) => {
    const user = await getCurrentSession();
    if (!user) return unauthorized();
    return handler(request, user, ...args);
  });
}

export async function readJson(request: Request, limit = 64 * 1024): Promise<unknown> {
  const mediaType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new ApiError(415, "unsupported_media_type", "Expected application/json");
  }

  const tooLarge = () => new ApiError(413, "payload_too_large", "Request body is too large");
  const malformed = () => new ApiError(400, "invalid_json", "Invalid JSON body");

  if (Number(request.headers.get("content-length")) > limit) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) throw malformed();

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let raw = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) {
        void reader.cancel().catch(() => {});
        throw tooLarge();
      }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(raw + decoder.decode()) as unknown;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw malformed();
  } finally {
    reader.releaseLock();
  }
}
