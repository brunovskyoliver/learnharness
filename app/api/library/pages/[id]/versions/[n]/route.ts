/** GET one version with its text; PATCH its name (feature 010). */
import { pageVersionNameResponse, pageVersionResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; n: string }> };

export const GET = withTenant(async (_request: Request, ctx: Context) => {
	const { id, n } = await ctx.params;
	return pageVersionResponse(id, n);
});
export const PATCH = withTenant(async (request: Request, ctx: Context) => {
	const { id, n } = await ctx.params;
	return pageVersionNameResponse(request, id, n);
});
