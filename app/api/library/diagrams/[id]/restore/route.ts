/** POST brings an old version back as a new one. */
import { diagramRestoreResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const POST = withTenant(async (request: Request, ctx: Context) => diagramRestoreResponse(request, (await ctx.params).id));
