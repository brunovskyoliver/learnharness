/** POST applies a proposal as a new version with an AI author. */
import { diagramProposalApproveResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const POST = withTenant(async (request: Request, ctx: Context) => diagramProposalApproveResponse(request, (await ctx.params).id));
