/** GET a PDF's highlights and annotations; POST adds one (feature 020). */
import { annotationCreateResponse, annotationsListResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = withTenant(async (_request: Request, ctx: Context) => annotationsListResponse((await ctx.params).id));
export const POST = withTenant(async (request: Request, ctx: Context) => annotationCreateResponse(request, (await ctx.params).id));
