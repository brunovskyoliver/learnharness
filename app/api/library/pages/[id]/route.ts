/** GET a page's head and draft. */
import { pageReadResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = withTenant(async (_request: Request, ctx: Context) => pageReadResponse((await ctx.params).id));
