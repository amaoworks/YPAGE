import { webUrl } from "@/lib/db/schema";
import { getFavicon } from "@/lib/favicon";
import { requireApiAuth } from "@/lib/http/api";

export const GET = requireApiAuth(async (request) => {
  const url = webUrl.parse(new URL(request.url).searchParams.get("url"));
  const { body, type } = await getFavicon(url);
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
