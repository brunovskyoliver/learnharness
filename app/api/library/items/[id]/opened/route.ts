/** POST remembers that an item was opened, for Recent (feature 012). */
import { libraryOpenedResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const POST = withTenant(async (_request: Request, ctx: Context) => libraryOpenedResponse((await ctx.params).id));
