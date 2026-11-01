/** POST rates a card (feature 021). */
import { cardReviewResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const POST = withTenant(async (request: Request, ctx: Context) => cardReviewResponse(request, (await ctx.params).id));
