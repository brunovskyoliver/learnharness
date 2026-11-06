/** POST a Notebook run: read, think, visualize, reply or chat (feature 024, api.md). */
import { notebookRunStartResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ pageId: string }> };

export const POST = withTenant(async (request: Request, ctx: Context) => notebookRunStartResponse(request, (await ctx.params).pageId));
