/** POST declines a proposal. The diagram doesn't change. */
import { diagramProposalRejectResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const POST = withTenant(async (_request: Request, ctx: Context) => diagramProposalRejectResponse((await ctx.params).id));
