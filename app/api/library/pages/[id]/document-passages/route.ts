/** POST saves a PDF passage to the end of a page, with its citation (feature 020). */
import { pageDocumentPassageResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const POST = withTenant(async (request: Request, ctx: Context) => pageDocumentPassageResponse(request, (await ctx.params).id));
