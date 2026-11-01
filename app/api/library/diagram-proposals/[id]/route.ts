/** GET a proposal and what it would change. PUT changes it (Edit first). */
import { diagramProposalEditResponse, diagramProposalResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = withTenant(async (_request: Request, ctx: Context) => diagramProposalResponse((await ctx.params).id));
export const PUT = withTenant(async (request: Request, ctx: Context) => diagramProposalEditResponse(request, (await ctx.params).id));
