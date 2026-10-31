/** POST saves a lesson passage to the end of a page, with its source (feature 017). */
import { pagePassageResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const POST = withTenant(async (request: Request, ctx: Context) => pagePassageResponse(request, (await ctx.params).id));
