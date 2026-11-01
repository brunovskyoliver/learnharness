/** GET a held edit with what it would change now; PUT is Edit first. Neither touches the page. */
import { pageProposalEditResponse, pageProposalResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = withTenant(async (_request: Request, ctx: Context) => pageProposalResponse((await ctx.params).id));
export const PUT = withTenant(async (request: Request, ctx: Context) => pageProposalEditResponse(request, (await ctx.params).id));
