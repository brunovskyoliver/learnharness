/** GET the version list, newest first. POST commits a version. */
import { diagramCommitResponse, diagramVersionsResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = withTenant(async (_request: Request, ctx: Context) => diagramVersionsResponse((await ctx.params).id));
export const POST = withTenant(async (request: Request, ctx: Context) => diagramCommitResponse(request, (await ctx.params).id));
