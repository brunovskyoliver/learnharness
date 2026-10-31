/** POST restores a trash entry; DELETE removes it for good (feature 012). */
import { libraryPurgeResponse, libraryRestoreResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const POST = withTenant(async (_request: Request, ctx: Context) => libraryRestoreResponse((await ctx.params).id));
export const DELETE = withTenant(async (_request: Request, ctx: Context) => libraryPurgeResponse((await ctx.params).id));
