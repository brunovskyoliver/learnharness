/** The last version the learner has seen, and the tutor versions since (feature 010). */
import { pageMarkSeenResponse, pageSeenResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = withTenant(async (_request: Request, ctx: Context) => pageSeenResponse((await ctx.params).id));
export const PUT = withTenant(async (request: Request, ctx: Context) => pageMarkSeenResponse(request, (await ctx.params).id));
