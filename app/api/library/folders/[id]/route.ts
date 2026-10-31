/** PATCH renames or moves and DELETE removes one Library folder (feature 011). */
import { folderDeleteResponse, folderPatchResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const PATCH = withTenant(async (request: Request, ctx: Context) => folderPatchResponse(request, (await ctx.params).id));
export const DELETE = withTenant(async (_request: Request, ctx: Context) => folderDeleteResponse((await ctx.params).id));
