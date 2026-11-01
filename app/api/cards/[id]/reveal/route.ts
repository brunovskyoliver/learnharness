/** POST sends the back and predicted intervals, on the learner's asking (feature 021). */
import { cardRevealResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const POST = withTenant(async (_request: Request, ctx: Context) => cardRevealResponse((await ctx.params).id));
