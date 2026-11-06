/** GET a Notebook run's events over SSE: buffered first, then live (feature 024, api.md). */
import { notebookRunEventsResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ runId: string }> };

export const GET = withTenant(async (_request: Request, ctx: Context) => notebookRunEventsResponse((await ctx.params).runId));
