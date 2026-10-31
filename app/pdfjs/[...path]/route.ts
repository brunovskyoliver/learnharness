/** The PDF reader's worker, fonts and character maps, from the installed package
 *  (feature 020). Outside /api so a module worker's own request needs no desktop
 *  header; hosted, the proxy still requires a session. No learner data. */
import { pdfjsAssetResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

export const GET = withTenant(async (_request: Request, ctx: Context) => pdfjsAssetResponse((await ctx.params).path));
