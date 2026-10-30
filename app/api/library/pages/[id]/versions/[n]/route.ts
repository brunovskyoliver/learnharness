/** GET one version with its text. */
import { pageVersionResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; n: string }> };

export const GET = withTenant(async (_request: Request, ctx: Context) => {
	const { id, n } = await ctx.params;
	return pageVersionResponse(id, n);
});
