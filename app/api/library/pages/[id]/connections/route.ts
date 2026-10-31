/** A page's links, backlinks, related notes, sessions, sources and graph (features 016-017). */
import { pageConnectionsResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = withTenant(async (_request: Request, ctx: Context) => pageConnectionsResponse((await ctx.params).id));
