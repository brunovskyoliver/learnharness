/** GET a note's companion; PATCH its mode, instruction or reviewer (feature 024, api.md). */
import { notebookPatchResponse, notebookReadResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ pageId: string }> };

export const GET = withTenant(async (_request: Request, ctx: Context) => notebookReadResponse((await ctx.params).pageId));
export const PATCH = withTenant(async (request: Request, ctx: Context) => notebookPatchResponse(request, (await ctx.params).pageId));
