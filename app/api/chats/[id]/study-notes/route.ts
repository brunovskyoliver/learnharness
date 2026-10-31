/** POST turns a lesson into a new page of study notes, with no model call (feature 017). */
import { studyNotesResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const POST = withTenant(async (_request: Request, ctx: Context) => studyNotesResponse((await ctx.params).id));
