/** The pages tied to a session (feature 017). */
import { sessionPagesResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = withTenant(async (_request: Request, ctx: Context) => sessionPagesResponse((await ctx.params).id));
