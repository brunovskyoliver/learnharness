/** Export a note as PDF, Word or Markdown, with or without the AI's notes (feature 024, api.md "Export"). */
import { notebookExportResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ pageId: string }> };

export const POST = withTenant(async (request: Request, ctx: Context) => notebookExportResponse(request, (await ctx.params).pageId));
