/** POST applies a held edit: his draft as his version, then an AI-authored version. */
import { pageProposalAcceptResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const POST = withTenant(async (request: Request, ctx: Context) => pageProposalAcceptResponse(request, (await ctx.params).id));
