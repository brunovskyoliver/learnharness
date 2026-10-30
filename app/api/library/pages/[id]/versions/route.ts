/** GET lists a page's versions; POST commits one. */
import { pageCommitResponse, pageVersionsResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = withTenant(async (_request: Request, ctx: Context) => pageVersionsResponse((await ctx.params).id));
export const POST = withTenant(async (request: Request, ctx: Context) => pageCommitResponse(request, (await ctx.params).id));
