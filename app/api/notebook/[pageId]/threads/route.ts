/** POST a thread his question opens ("Ask about this"), write-ahead (feature 024, api.md). */
import { notebookThreadCreateResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ pageId: string }> };

export const POST = withTenant(async (request: Request, ctx: Context) => notebookThreadCreateResponse(request, (await ctx.params).pageId));
