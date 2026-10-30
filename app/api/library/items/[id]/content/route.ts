/** GET a document's bytes. Never served as HTML; `?download=1` for attachment. */
import { libraryContentResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const GET = withTenant(async (request: Request, ctx: { params: Promise<{ id: string }> }) => libraryContentResponse(request, (await ctx.params).id));
