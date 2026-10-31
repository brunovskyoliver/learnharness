/** PUT the learner's draft, compare-and-swap on base and rev. */
import { pageDraftResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const PUT = withTenant(async (request: Request, ctx: Context) => pageDraftResponse(request, (await ctx.params).id));
