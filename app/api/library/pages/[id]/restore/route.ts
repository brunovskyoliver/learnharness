/** POST restores a version as a new one. */
import { pageRestoreResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const POST = withTenant(async (request: Request, ctx: Context) => pageRestoreResponse(request, (await ctx.params).id));
