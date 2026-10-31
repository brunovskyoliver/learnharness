/** PATCH renames and DELETE removes one Library item. */
import { libraryDeleteResponse, libraryPatchResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const PATCH = withTenant(async (request: Request, ctx: Context) => libraryPatchResponse(request, (await ctx.params).id));
export const DELETE = withTenant(async (_request: Request, ctx: Context) => libraryDeleteResponse((await ctx.params).id));
