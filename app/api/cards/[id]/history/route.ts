/** GET a card's reviews, newest first (feature 021). */
import { cardHistoryResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = withTenant(async (_request: Request, ctx: Context) => cardHistoryResponse((await ctx.params).id));
