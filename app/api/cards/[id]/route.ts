/** GET a card with its back for editing; PATCH edits; DELETE moves it to Deleted, or removes it for good (feature 021). */
import { cardDeleteResponse, cardGetResponse, cardPatchResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = withTenant(async (_request: Request, ctx: Context) => cardGetResponse((await ctx.params).id));
export const PATCH = withTenant(async (request: Request, ctx: Context) => cardPatchResponse(request, (await ctx.params).id));
export const DELETE = withTenant(async (request: Request, ctx: Context) => cardDeleteResponse(request, (await ctx.params).id));
