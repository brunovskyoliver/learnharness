/** POST keeps a draft, which joins the queue (feature 021). */
import { cardAcceptResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const POST = withTenant(async (request: Request, ctx: Context) => cardAcceptResponse(request, (await ctx.params).id));
