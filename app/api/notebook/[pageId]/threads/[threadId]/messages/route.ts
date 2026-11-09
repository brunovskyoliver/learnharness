/** POST his Write back, write-ahead of the reply run (feature 024, api.md). */
import { notebookMessageCreateResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ pageId: string; threadId: string }> };

export const POST = withTenant(async (request: Request, ctx: Context) => {
	const { pageId, threadId } = await ctx.params;
	return notebookMessageCreateResponse(request, pageId, threadId);
});
