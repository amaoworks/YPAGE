import { editGroup, recordId } from "@/lib/db/schema";
import { deleteGroup, updateGroup } from "@/lib/db/store";
import { json, readJson, requireApiAuth } from "@/lib/http/api";

type Context = { params: Promise<{ id: string }> };

export const PATCH = requireApiAuth(async (request, _user, { params }: Context) => {
  const id = recordId.parse((await params).id);
  return json(updateGroup(id, editGroup.parse(await readJson(request))));
});

export const DELETE = requireApiAuth(async (_request, _user, { params }: Context) => {
  deleteGroup(recordId.parse((await params).id));
  return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
});
