/** PATCH replaces or removes a repo link's token; DELETE unlinks it (feature 026, contracts/api.md). */
import { repoLinkDeleteResponse, repoLinkPatchResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const PATCH = withTenant(async (request: Request, ctx: Context) => repoLinkPatchResponse(request, (await ctx.params).id));
export const DELETE = withTenant(async (_request: Request, ctx: Context) => repoLinkDeleteResponse((await ctx.params).id));
