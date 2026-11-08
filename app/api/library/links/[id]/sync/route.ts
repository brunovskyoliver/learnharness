/** POST starts a pull of one repo link now, or joins the running one (feature 026, contracts/api.md). */
import { repoLinkSyncResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const POST = withTenant(async (_request: Request, ctx: Context) => repoLinkSyncResponse((await ctx.params).id));
