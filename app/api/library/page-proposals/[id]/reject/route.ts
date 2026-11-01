/** POST turns a held edit down. The page never changed. */
import { pageProposalRejectResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const POST = withTenant(async (_request: Request, ctx: Context) => pageProposalRejectResponse((await ctx.params).id));
