/** GET a diagram's head and draft. */
import { diagramReadResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = withTenant(async (_request: Request, ctx: Context) => diagramReadResponse((await ctx.params).id));
