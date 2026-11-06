/** PATCH a thread's status: resolved, dismissed, or open again (Undo) (feature 024, api.md). */
import { notebookThreadPatchResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ pageId: string; threadId: string }> };

export const PATCH = withTenant(async (request: Request, ctx: Context) => {
	const { pageId, threadId } = await ctx.params;
	return notebookThreadPatchResponse(request, pageId, threadId);
});
